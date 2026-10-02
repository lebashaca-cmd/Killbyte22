(() => {
  const sharedBodyElements = ".page-nav, .orb-field, .background-layer, .battery-indicator, .clock-indicator, .context-menu";
  const sharedScripts = new Set(["context-menu.js", "site-settings.js", "navigation.js"]);
  let navigationId = 0;

  function updateNavigation(url) {
    document.querySelectorAll(".page-nav a[href]").forEach((link) => {
      const isCurrent = new URL(link.href, location.href).pathname === url.pathname;
      if (isCurrent) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  async function runPageScripts(parsedPage, pageUrl, requestId) {
    for (const sourceScript of parsedPage.querySelectorAll("script")) {
      if (requestId !== navigationId) return;
      if (sourceScript.src) {
        const sourceUrl = new URL(sourceScript.getAttribute("src"), pageUrl);
        if (sharedScripts.has(sourceUrl.pathname.split("/").pop())) continue;

        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = sourceUrl.href;
          script.onload = resolve;
          script.onerror = () => reject(new Error(`Could not load page script: ${sourceUrl.pathname}`));
          document.head.appendChild(script);
        });
      } else if (!sourceScript.type || sourceScript.type === "text/javascript") {
        new Function(sourceScript.textContent)();
      }
    }
  }

  async function navigate(url, { replace = false } = {}) {
    const requestId = ++navigationId;
    try {
      const response = await fetch(url, { headers: { Accept: "text/html" } });
      if (!response.ok) throw new Error(`Page request failed with status ${response.status}.`);

      const html = await response.text();
      const parsedPage = new DOMParser().parseFromString(html, "text/html");
      const base = parsedPage.createElement("base");
      base.href = url;
      parsedPage.head.prepend(base);
      if (requestId !== navigationId) return;

      window.dispatchEvent(new Event("killbyte:beforeNavigate"));
      const pageElements = Array.from(document.body.children)
        .filter((element) => !element.matches(sharedBodyElements));
      pageElements.forEach((element) => element.remove());

      const sharedClasses = Array.from(document.body.classList)
        .filter((className) => className.startsWith("theme-") || className === "sidebar-layout");
      const pageClasses = Array.from(parsedPage.body.classList)
        .filter((className) => !className.startsWith("theme-") && className !== "sidebar-layout");
      document.body.className = [...new Set([...pageClasses, ...sharedClasses])].join(" ");

      Array.from(parsedPage.body.children)
        .filter((element) => !element.matches(sharedBodyElements) && element.tagName !== "SCRIPT")
        .forEach((element) => document.body.appendChild(document.importNode(element, true)));

      document.title = parsedPage.title;
      if (replace) {
        history.replaceState({}, "", url);
      } else {
        history.pushState({}, "", url);
      }
      updateNavigation(new URL(url, location.href));

      window.initializeKillbytePageSettings?.();
      await runPageScripts(parsedPage, url, requestId);
      if (requestId !== navigationId) return;
      window.scrollTo(0, 0);
      document.querySelector("main h1, body > .box h1, body > .WOWOW h1")?.focus({ preventScroll: true });
    } catch (error) {
      console.error("Could not switch pages without reloading.", error);
      location.assign(url);
    }
  }

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest("a[href]");
    if (!link || link.target || link.hasAttribute("download")) return;

    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname === location.pathname) return;

    event.preventDefault();
    navigate(url.href);
  });

  window.addEventListener("popstate", () => navigate(location.href, { replace: true }));
  window.killbyteNavigate = navigate;
})();
