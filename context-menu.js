(() => {
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Page actions");
  menu.hidden = true;
  document.body.appendChild(menu);

  let activeLink = null;

  function closeMenu() {
    menu.hidden = true;
  }

  function addItem(label, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("role", "menuitem");
    button.addEventListener("click", () => {
      closeMenu();
      action();
    });
    menu.appendChild(button);
  }

  function addSeparator() {
    const separator = document.createElement("div");
    separator.className = "menu-separator";
    separator.setAttribute("role", "separator");
    menu.appendChild(separator);
  }

  document.addEventListener("contextmenu", (event) => {
    if (event.target.closest("input, textarea, select, [contenteditable='true']")) return;

    event.preventDefault();
    activeLink = event.target.closest("a[href]");
    menu.replaceChildren();
    addItem("←  Go back", () => history.back());
    addItem("↻  Reload page", () => location.reload());
    addItem("⌂  Home", () => {
      if (window.killbyteNavigate) {
        window.killbyteNavigate(new URL("index.html", location.href).href);
      } else {
        location.href = "index.html";
      }
    });
    if (activeLink) {
      addSeparator();
      addItem("↗  Open link in new tab", () => window.open(activeLink.href, "_blank", "noopener,noreferrer"));
      addItem("⧉  Copy link address", async () => {
        try {
          await navigator.clipboard.writeText(activeLink.href);
        } catch {
          const field = document.createElement("textarea");
          field.value = activeLink.href;
          field.style.position = "fixed";
          field.style.opacity = "0";
          document.body.appendChild(field);
          field.select();
          document.execCommand("copy");
          field.remove();
        }
      });
    } else {
      addSeparator();
      addItem("⧉  Copy page address", async () => {
        try {
          await navigator.clipboard.writeText(location.href);
        } catch {
          const field = document.createElement("textarea");
          field.value = location.href;
          field.style.position = "fixed";
          field.style.opacity = "0";
          document.body.appendChild(field);
          field.select();
          document.execCommand("copy");
          field.remove();
        }
      });
    }

    menu.hidden = false;
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    menu.style.left = `${Math.min(event.clientX, window.innerWidth - menuWidth - 8)}px`;
    menu.style.top = `${Math.min(event.clientY, window.innerHeight - menuHeight - 8)}px`;
    menu.querySelector("button")?.focus();
  });

  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target)) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
  window.addEventListener("blur", closeMenu);
})();
