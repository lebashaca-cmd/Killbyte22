(() => {
  const form = document.getElementById("browser-form");
  const address = document.getElementById("browser-address");
  const frameElement = document.getElementById("browser-frame");
  const browserPanel = document.querySelector(".browser-page > .box");
  const status = document.getElementById("browser-status");
  const fullscreenButton = document.getElementById("browser-fullscreen");
  const initialUrl = new URLSearchParams(window.location.search).get("url");
  const selectedProxy = localStorage.getItem("killbyte-browser-proxy") === "ultraviolet"
    ? "ultraviolet"
    : "scramjet";
  const proxyName = selectedProxy === "ultraviolet" ? "Ultraviolet" : "Scramjet";
  const searchUrl = (value) => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.href;
      }
      return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
    } catch {
      if (/^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(trimmed)) {
        return `https://${trimmed}`;
      }
      return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
    }
  };

  let proxiedFrame;
  let frameReady = false;

  function navigate(value) {
    const url = searchUrl(value);
    if (!url) {
      status.textContent = "Enter a website address or search.";
      return;
    }

    address.value = url;
    if (!frameReady) {
      status.textContent = `${proxyName} is still starting. Try again in a moment.`;
      return;
    }

    status.textContent = `Loading ${url}`;
    if (selectedProxy === "ultraviolet") {
      frameElement.src = `${window.__uv$config.prefix}${window.__uv$config.encodeUrl(url)}`;
    } else {
      proxiedFrame.go(url);
    }
    window.history.replaceState(null, "", `?url=${encodeURIComponent(url)}`);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    navigate(address.value);
  });

  document.getElementById("browser-back").addEventListener("click", () => {
    frameElement.contentWindow.history.back();
  });

  document.getElementById("browser-forward").addEventListener("click", () => {
    frameElement.contentWindow.history.forward();
  });

  document.getElementById("browser-reload").addEventListener("click", () => {
    if (frameReady) frameElement.contentWindow.location.reload();
  });

  fullscreenButton.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement === browserPanel) {
        await document.exitFullscreen();
      } else {
        await browserPanel.requestFullscreen();
      }
    } catch (error) {
      console.error("Could not toggle browser fullscreen.", error);
      status.textContent = "Fullscreen is unavailable in this browser.";
    }
  });

  const updateFullscreenLabel = () => {
    fullscreenButton.textContent = document.fullscreenElement === browserPanel
      ? "⛶ Exit fullscreen"
      : "⛶ Fullscreen";
  };
  document.addEventListener("fullscreenchange", updateFullscreenLabel);
  window.addEventListener("killbyte:beforeNavigate", () => {
    document.removeEventListener("fullscreenchange", updateFullscreenLabel);
  }, { once: true });

  frameElement.addEventListener("load", () => {
    if (frameReady) status.textContent = `${proxyName} ready`;
  });

  async function initialize() {
    if (!("serviceWorker" in navigator)) {
      status.textContent = `This browser does not support service workers required by ${proxyName}.`;
      return;
    }

    try {
      status.textContent = `Starting ${proxyName}…`;
      if (selectedProxy === "ultraviolet") {
        await initializeUltraviolet();
      } else {
        await initializeScramjet();
      }
      frameReady = true;
      status.textContent = `${proxyName} ready`;
      navigate(initialUrl || "https://google.com");
    } catch (error) {
      console.error(`${proxyName} browser could not start.`, error);
      status.textContent = `${proxyName} startup failed: ${error.message}`;
    }
  }

  async function initializeScramjet() {
    if (!window.$scramjetController || !window.$scramjet || !window.EpoxyTransport) {
      throw new Error("Scramjet files did not load. Rebuild and redeploy the site.");
    }
    if (!window.KILLBYTE_WISP_URL) {
      throw new Error("Set KILLBYTE_WISP_URL in proxy-config.js to a Wisp WebSocket URL.");
    }

    status.textContent = "Connecting to the Scramjet proxy…";
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const serviceworker = navigator.serviceWorker.controller
      || (await navigator.serviceWorker.ready).active;
    if (!serviceworker) {
      throw new Error("The Scramjet service worker did not become active. Reload this page.");
    }

    const EpoxyTransport = window.EpoxyTransport.default;
    const transport = new EpoxyTransport({ wisp: window.KILLBYTE_WISP_URL });
    await transport.init();

    const controller = new window.$scramjetController.Controller({
      serviceworker,
      transport,
      scramjetConfig: window.$scramjet.defaultConfig
    });
    await controller.wait();
    proxiedFrame = controller.createFrame(frameElement);
  }

  async function initializeUltraviolet() {
    if (!window.BareMux?.BareMuxConnection || !window.Ultraviolet || !window.__uv$config) {
      throw new Error("Ultraviolet files did not load. Rebuild and redeploy the site.");
    }
    if (!window.KILLBYTE_UV_WISP_URL) {
      throw new Error("The Ultraviolet Render proxy endpoint is missing from the build.");
    }

    status.textContent = "Connecting to the Ultraviolet proxy…";
    const registration = await navigator.serviceWorker.register("/uv/sw.js");
    const worker = registration.active || registration.installing || registration.waiting;
    if (!worker) {
      throw new Error("The Ultraviolet service worker did not become active. Reload this page.");
    }
    if (worker.state !== "activated") {
      await new Promise((resolve, reject) => {
        const onStateChange = () => {
          if (worker.state === "activated") {
            worker.removeEventListener("statechange", onStateChange);
            resolve();
          }
          if (worker.state === "redundant") {
            worker.removeEventListener("statechange", onStateChange);
            reject(new Error("The Ultraviolet service worker failed to install."));
          }
        };
        worker.addEventListener("statechange", onStateChange);
        onStateChange();
      });
    }

    const connection = new window.BareMux.BareMuxConnection("/baremux/worker.js");
    await connection.setTransport("/epoxy/index.mjs", [
      { wisp: window.KILLBYTE_UV_WISP_URL }
    ]);
  }

  initialize();
})();
