(() => {
  const form = document.getElementById("browser-form");
  const address = document.getElementById("browser-address");
  const frameElement = document.getElementById("browser-frame");
  const browserPanel = document.querySelector(".browser-page > .box");
  const status = document.getElementById("browser-status");
  const fullscreenButton = document.getElementById("browser-fullscreen");
  const initialUrl = new URLSearchParams(window.location.search).get("url");
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
      status.textContent = "Scramjet is still starting. Try again in a moment.";
      return;
    }

    status.textContent = `Loading ${url}`;
    proxiedFrame.go(url);
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
    if (frameReady) status.textContent = "Ready";
  });

  async function initialize() {
    if (!("serviceWorker" in navigator)) {
      status.textContent = "This browser does not support service workers required by Scramjet.";
      return;
    }

    try {
      if (!window.$scramjetController || !window.$scramjet || !window.EpoxyTransport) {
        throw new Error("Scramjet files did not load. Rebuild and redeploy the site.");
      }
      if (!window.KILLBYTE_WISP_URL) {
        throw new Error("Set KILLBYTE_WISP_URL in proxy-config.js to a Wisp WebSocket URL.");
      }

      status.textContent = "Connecting to the proxy…";
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
      frameReady = true;
      status.textContent = "Ready";
      navigate(initialUrl || "https://google.com");
    } catch (error) {
      console.error("Scramjet browser could not start.", error);
      status.textContent = `Browser startup failed: ${error.message}`;
    }
  }

  initialize();
})();
