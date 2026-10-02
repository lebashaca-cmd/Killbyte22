window.initializeKillbytePageSettings = () => {
  const root = document.documentElement;

  const siteFonts = {
    trebuchet: '"Trebuchet MS", "Segoe UI", sans-serif',
    arial: "Arial, sans-serif",
    verdana: "Verdana, sans-serif",
    georgia: "Georgia, serif",
    courier: '"Courier New", monospace'
  };
  const siteFontNames = {
    trebuchet: "Trebuchet MS",
    arial: "Arial",
    verdana: "Verdana",
    georgia: "Georgia",
    courier: "Courier New"
  };
  const savedFont = localStorage.getItem("killbyte-site-font") || "trebuchet";
  const selectedFont = siteFonts[savedFont] ? savedFont : "trebuchet";
  root.style.setProperty("--site-font", siteFonts[selectedFont]);

  if (!window.killbyteFontChangeListener) {
    window.killbyteFontChangeListener = true;
    document.addEventListener("change", (event) => {
      if (event.target.name !== "site-font") return;
      const font = siteFonts[event.target.value];
      if (!font) return;

      root.style.setProperty("--site-font", font);
      localStorage.setItem("killbyte-site-font", event.target.value);
      const fontLabel = document.getElementById("site-font-label");
      if (fontLabel) fontLabel.textContent = siteFontNames[event.target.value];
      const fontPicker = document.getElementById("site-font-picker");
      if (fontPicker) fontPicker.open = false;
    });
  }
  const fontLabel = document.getElementById("site-font-label");
  if (fontLabel) fontLabel.textContent = siteFontNames[selectedFont];
  document.querySelectorAll("input[name='site-font']").forEach((option) => {
    option.checked = option.value === selectedFont;
  });

  const orbField = document.querySelector(".orb-field") || document.createElement("div");
  if (!orbField.isConnected) {
    orbField.className = "orb-field";
    orbField.setAttribute("aria-hidden", "true");
    const orbSettings = [
      ["8%", "18%", "3px", "0.8", "var(--neon-color)", "18px", "14s", "-3s", "18px", "-12px"],
      ["24%", "72%", "2px", "0.7", "var(--neon-secondary)", "13px", "17s", "-8s", "-24px", "16px"],
      ["42%", "34%", "4px", "0.75", "var(--neon-color)", "22px", "20s", "-11s", "22px", "20px"],
      ["62%", "82%", "2px", "0.65", "var(--neon-secondary)", "14px", "15s", "-5s", "-18px", "-18px"],
      ["78%", "24%", "3px", "0.8", "var(--neon-color)", "17px", "19s", "-14s", "16px", "-20px"],
      ["91%", "64%", "4px", "0.72", "var(--neon-secondary)", "21px", "16s", "-2s", "-20px", "12px"]
    ];

    orbSettings.forEach((settings) => {
      const orb = document.createElement("span");
      orb.className = "orb";
      ["--orb-x", "--orb-y", "--orb-size", "--orb-opacity", "--orb-color", "--orb-blur", "--orb-duration", "--orb-delay", "--orb-drift-x", "--orb-drift-y"].forEach((property, index) => {
        orb.style.setProperty(property, settings[index]);
      });
      orbField.appendChild(orb);
    });
    document.body.prepend(orbField);
  }

  const backgroundLayer = document.querySelector(".background-layer") || document.createElement("div");
  if (!backgroundLayer.isConnected) {
    backgroundLayer.className = "background-layer";
    backgroundLayer.setAttribute("aria-hidden", "true");
    document.body.prepend(backgroundLayer);
  }

  const batteryIndicator = document.querySelector(".battery-indicator") || document.createElement("div");
  if (!batteryIndicator.isConnected) {
    batteryIndicator.className = "battery-indicator";
    batteryIndicator.hidden = true;
    batteryIndicator.setAttribute("role", "status");
    batteryIndicator.innerHTML = `
      <span class="battery-icon" aria-hidden="true"><span class="battery-level"></span></span>
      <span class="battery-label"></span>
    `;
    document.body.appendChild(batteryIndicator);
  }

  const clockIndicator = document.querySelector(".clock-indicator") || document.createElement("div");
  if (!clockIndicator.isConnected) {
    clockIndicator.className = "clock-indicator";
    clockIndicator.setAttribute("role", "timer");
    clockIndicator.innerHTML = `
      <span class="clock-time"></span>
      <span class="clock-date"></span>
    `;
    document.body.appendChild(clockIndicator);
  }

  const updateClock = () => {
    const now = new Date();
    clockIndicator.querySelector(".clock-time").textContent = now.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
    clockIndicator.querySelector(".clock-date").textContent = now.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "2-digit"
    });
  };

  updateClock();
  if (!window.killbyteClockInterval) {
    window.killbyteClockInterval = window.setInterval(updateClock, 1000);
  }

  async function setupBatteryIndicator() {
    if (!navigator.getBattery || window.killbyteBatterySetup) return;
    window.killbyteBatterySetup = true;

    try {
      const battery = await navigator.getBattery();
      const batteryLevel = batteryIndicator.querySelector(".battery-level");
      const batteryLabel = batteryIndicator.querySelector(".battery-label");

      const updateBattery = () => {
        const percent = Math.round(battery.level * 100);
        batteryLevel.style.setProperty("--battery-level", `${percent}%`);
        batteryLabel.textContent = `${percent}%${battery.charging ? " · Charging" : ""}`;
        batteryIndicator.classList.toggle("battery-charging", battery.charging);
        batteryIndicator.setAttribute("aria-label", `Battery ${percent}%${battery.charging ? ", charging" : ""}`);
        batteryIndicator.hidden = false;
      };

      updateBattery();
      battery.addEventListener("levelchange", updateBattery);
      battery.addEventListener("chargingchange", updateBattery);
    } catch {
      // Hide the indicator when the browser does not expose battery information.
    }
  }

  setupBatteryIndicator();

  const particleSets = {
    rain: { symbols: [""], colors: ["#9fd8ff", "#c9ebff", "#75b9e8"] },
    space: { symbols: [""], colors: ["#8be9fd", "#ff79c6", "#bd93f9", "#f8f8f2"] },
    sakura: { symbols: ["✿", "❀", "✧"], colors: ["#ffb7d5", "#ffd6e7", "#fff0f7"] },
    snow: { symbols: ["❄", "❅", "•"], colors: ["#d9f3ff", "#ffffff", "#bde7ff"] }
  };

  function renderTheme(theme) {
    if (window.killbyteRenderedTheme === theme) return;
    window.killbyteRenderedTheme = theme;
    document.body.classList.remove("theme-rain", "theme-space", "theme-sakura", "theme-snow", "theme-media");
    backgroundLayer.replaceChildren();
    if (theme === "default") return;
    document.body.classList.add(`theme-${theme}`);
    if (!particleSets[theme]) return;

    const set = particleSets[theme];
    const count = theme === "rain" ? 110 : theme === "space" ? 28 : 42;
    for (let index = 0; index < count; index += 1) {
      const particle = document.createElement("span");
      particle.className = "background-particle";
      particle.textContent = set.symbols[index % set.symbols.length];
      particle.style.setProperty("--particle-left", `${Math.random() * 100}%`);
      particle.style.setProperty("--particle-top", `${Math.random() * 100}%`);
      particle.style.setProperty("--particle-size", `${theme === "space" ? 2 + Math.random() * 5 : theme === "rain" ? 10 + Math.random() * 30 : 12 + Math.random() * 18}px`);
      particle.style.setProperty("--particle-opacity", `${theme === "rain" ? 0.2 + Math.random() * 0.55 : 0.35 + Math.random() * 0.6}`);
      particle.style.setProperty("--particle-duration", `${theme === "rain" ? 0.55 + Math.random() * 0.9 : 10 + Math.random() * 18}s`);
      particle.style.setProperty("--particle-delay", `${-Math.random() * 20}s`);
      particle.style.setProperty("--particle-drift", `${-25 + Math.random() * 50}vw`);
      particle.style.setProperty("--particle-color", set.colors[index % set.colors.length]);
      backgroundLayer.appendChild(particle);
    }
  }

  const mediaDatabase = "killbyte-media";
  const mediaStore = "background";
  const videoTimeKey = "killbyte-background-video-time";
  let activeBackgroundVideo = window.killbyteActiveBackgroundVideo || null;

  function configureBackgroundVideo(video) {
    activeBackgroundVideo = video;
    window.killbyteActiveBackgroundVideo = video;
    video.addEventListener("loadedmetadata", () => {
      const savedTime = Number(localStorage.getItem(videoTimeKey));
      if (Number.isFinite(savedTime) && savedTime > 0 && savedTime < video.duration) {
        video.currentTime = savedTime;
      }
    }, { once: true });
    video.addEventListener("timeupdate", () => {
      localStorage.setItem(videoTimeKey, String(video.currentTime));
    });
  }

  if (!window.killbyteBackgroundPagehideListener) {
    window.killbyteBackgroundPagehideListener = true;
    window.addEventListener("pagehide", () => {
      if (window.killbyteActiveBackgroundVideo) {
        localStorage.setItem(videoTimeKey, String(window.killbyteActiveBackgroundVideo.currentTime));
      }
    });
  }

  function openMediaDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(mediaDatabase, 1);
      request.addEventListener("upgradeneeded", () => {
        request.result.createObjectStore(mediaStore);
      });
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
  }

  async function saveMedia(key, file) {
    const database = await openMediaDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(mediaStore, "readwrite");
      transaction.objectStore(mediaStore).put(file, key);
      transaction.addEventListener("complete", resolve);
      transaction.addEventListener("error", () => reject(transaction.error));
    });
    database.close();
  }

  async function loadMedia(key) {
    try {
      const database = await openMediaDatabase();
      const value = await new Promise((resolve, reject) => {
        const request = database.transaction(mediaStore).objectStore(mediaStore).get(key);
        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () => reject(request.error));
      });
      database.close();
      return value;
    } catch {
      return null;
    }
  }

  async function deleteMedia() {
    try {
      const database = await openMediaDatabase();
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(mediaStore, "readwrite");
        const store = transaction.objectStore(mediaStore);
        store.delete("picture");
        store.delete("video");
        transaction.addEventListener("complete", resolve);
        transaction.addEventListener("error", () => reject(transaction.error));
      });
      database.close();
    } catch {
      // The local settings can still be cleared if IndexedDB is unavailable.
    }
  }

  async function applySavedMedia() {
    if (backgroundLayer.childElementCount > 0) return;
    const picture = await loadMedia("picture");
    const videoSource = await loadMedia("video");

    if (picture) {
      document.body.style.backgroundImage = `url(${URL.createObjectURL(picture)})`;
    }
    if (videoSource) {
      const video = document.createElement("video");
      video.src = URL.createObjectURL(videoSource);
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.className = "background-video";
      configureBackgroundVideo(video);
      backgroundLayer.replaceChildren(video);
    }
  }

  const savedLayout = localStorage.getItem("killbyte-layout-style") || "default";
  document.body.classList.toggle("sidebar-layout", savedLayout === "sidebar");

  const layoutPicker = document.getElementById("layout-style-picker");
  const layoutLabel = document.getElementById("layout-style-label");
  const layoutOptions = document.querySelectorAll("input[name='layout-style']");
  const layoutNames = {
    default: "Top navigation",
    sidebar: "Sidebar navigation"
  };
  if (layoutPicker) {
    const updateLayout = (layout) => {
      const selectedLayout = layoutNames[layout] ? layout : "default";
      localStorage.setItem("killbyte-layout-style", selectedLayout);
      document.body.classList.toggle("sidebar-layout", selectedLayout === "sidebar");
      layoutLabel.textContent = layoutNames[selectedLayout];
      layoutOptions.forEach((option) => {
        option.checked = option.value === selectedLayout;
      });
    };
    layoutOptions.forEach((option) => {
      option.addEventListener("change", () => {
        updateLayout(option.value);
        layoutPicker.open = false;
      });
    });
    updateLayout(savedLayout);
  }

  const savedTheme = localStorage.getItem("killbyte-background-theme") || "default";
  renderTheme(savedTheme);
  if (savedTheme === "media") applySavedMedia();

  const themePicker = document.getElementById("background-theme-picker");
  const themeLabel = document.getElementById("background-theme-label");
  const themeOptions = document.querySelectorAll("input[name='background-theme']");
  const themeNames = {
    default: "Neon gradient",
    rain: "Rain",
    space: "Space orbs",
    sakura: "Falling sakura",
    snow: "Falling snow",
    media: "Picture or video"
  };
  const mediaControls = document.getElementById("background-media-controls");
  const picturePicker = document.getElementById("background-picture");
  const videoPicker = document.getElementById("background-video");
  const pictureName = document.getElementById("background-picture-name");
  const videoName = document.getElementById("background-video-name");
  const clearMedia = document.getElementById("clear-background-media");
  if (themePicker) {
    const updateTheme = (theme) => {
      const selectedTheme = themeNames[theme] ? theme : "default";
      localStorage.setItem("killbyte-background-theme", selectedTheme);
      renderTheme(selectedTheme);
      if (themeLabel) themeLabel.textContent = themeNames[selectedTheme];
      if (mediaControls) mediaControls.hidden = selectedTheme !== "media";
      themeOptions.forEach((option) => {
        option.checked = option.value === selectedTheme;
      });
      if (selectedTheme === "media") applySavedMedia();
    };
    themeOptions.forEach((option) => {
      option.addEventListener("change", () => {
        updateTheme(option.value);
        themePicker.open = false;
      });
    });
    updateTheme(savedTheme);
  }

  function savePicture(file) {
    if (!file) return;
    const reader = new FileReader();
    saveMedia("picture", file).then(() => {
      document.body.style.backgroundImage = `url(${JSON.stringify(URL.createObjectURL(file))})`;
      if (themePicker) {
        themeOptions.forEach((option) => { option.checked = option.value === "media"; });
        if (themeLabel) themeLabel.textContent = themeNames.media;
      }
      localStorage.setItem("killbyte-background-theme", "media");
      if (mediaControls) mediaControls.hidden = false;
    }).catch(() => {
      if (pictureName) pictureName.textContent = "Could not save picture";
    });
  }
  picturePicker?.addEventListener("change", () => {
    const file = picturePicker.files[0];
    if (pictureName) pictureName.textContent = file ? file.name : "No picture selected";
    savePicture(file);
  });
  videoPicker?.addEventListener("change", () => {
    const file = videoPicker.files[0];
    if (videoName) videoName.textContent = file ? file.name : "No video selected";
    if (!file) return;
    const video = document.createElement("video");
    video.src = URL.createObjectURL(file);
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.className = "background-video";
    configureBackgroundVideo(video);
    backgroundLayer.replaceChildren(video);
    saveMedia("video", file).catch(() => {
      if (videoName) videoName.textContent = "Could not save video";
    });
    document.body.classList.add("theme-media");
    localStorage.setItem("killbyte-background-theme", "media");
    if (themePicker) {
      themeOptions.forEach((option) => { option.checked = option.value === "media"; });
      if (themeLabel) themeLabel.textContent = themeNames.media;
    }
    if (mediaControls) mediaControls.hidden = false;
  });
  clearMedia?.addEventListener("click", () => {
    localStorage.removeItem("killbyte-background-picture");
    localStorage.removeItem("killbyte-background-video");
    deleteMedia();
    localStorage.removeItem(videoTimeKey);
    activeBackgroundVideo = null;
    window.killbyteActiveBackgroundVideo = null;
    localStorage.setItem("killbyte-background-theme", "default");
    document.body.style.backgroundImage = "";
    backgroundLayer.replaceChildren();
    document.body.classList.remove("theme-media");
    if (themePicker) {
      themeOptions.forEach((option) => { option.checked = option.value === "default"; });
      if (themeLabel) themeLabel.textContent = themeNames.default;
      themePicker.open = false;
    }
    if (videoPicker) videoPicker.value = "";
    if (picturePicker) picturePicker.value = "";
    if (videoName) videoName.textContent = "No video selected";
    if (pictureName) pictureName.textContent = "No picture selected";
    if (mediaControls) mediaControls.hidden = true;
  });

  const savedColor = localStorage.getItem("killbyte-neon-color");
  if (savedColor && /^#[0-9a-f]{6}$/i.test(savedColor)) {
    root.style.setProperty("--neon-color", savedColor);
  }

  const savedSecondary = localStorage.getItem("killbyte-neon-secondary");
  if (savedSecondary && /^#[0-9a-f]{6}$/i.test(savedSecondary)) {
    root.style.setProperty("--neon-secondary", savedSecondary);
  }

  const colorPicker = document.getElementById("neon-color");
  const colorValue = document.getElementById("neon-color-value");
  const secondaryPicker = document.getElementById("neon-secondary");
  const secondaryValue = document.getElementById("neon-secondary-value");
  if (colorPicker) {
    if (savedColor && /^#[0-9a-f]{6}$/i.test(savedColor)) colorPicker.value = savedColor;
    colorPicker.addEventListener("input", () => {
      root.style.setProperty("--neon-color", colorPicker.value);
      localStorage.setItem("killbyte-neon-color", colorPicker.value);
      if (colorValue) colorValue.textContent = colorPicker.value;
    });
    if (colorValue) colorValue.textContent = colorPicker.value;
  }

  if (secondaryPicker) {
    if (savedSecondary && /^#[0-9a-f]{6}$/i.test(savedSecondary)) secondaryPicker.value = savedSecondary;
    secondaryPicker.addEventListener("input", () => {
      root.style.setProperty("--neon-secondary", secondaryPicker.value);
      localStorage.setItem("killbyte-neon-secondary", secondaryPicker.value);
      if (secondaryValue) secondaryValue.textContent = secondaryPicker.value;
    });
    if (secondaryValue) secondaryValue.textContent = secondaryPicker.value;
  }

  const cloakToggle = document.getElementById("cloak-toggle");
  const cloakButton = document.getElementById("cloak-button");
  if (cloakToggle && cloakButton) {
    cloakToggle.checked = localStorage.getItem("killbyte-cloaking") === "true";
    cloakToggle.addEventListener("change", () => {
      localStorage.setItem("killbyte-cloaking", String(cloakToggle.checked));
      cloakButton.disabled = !cloakToggle.checked;
    });
    cloakButton.disabled = !cloakToggle.checked;
    cloakButton.addEventListener("click", () => {
      const cloakedWindow = window.open("about:blank", "_blank");
      if (!cloakedWindow) return;
      const blankDocument = cloakedWindow.document;
      const body = blankDocument.body || blankDocument.documentElement.appendChild(blankDocument.createElement("body"));
      const frame = blankDocument.createElement("iframe");
      frame.src = location.href;
      frame.title = document.title;
      frame.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0";
      body.style.cssText = "margin:0;overflow:hidden";
      body.appendChild(frame);

      const warning = blankDocument.createElement("div");
      warning.textContent = "While in about:blank, Do not reload!";
      warning.setAttribute("role", "alert");
      warning.style.cssText = "position:fixed;z-index:2147483647;left:50%;bottom:20px;transform:translate(-50%,150%);padding:12px 18px;border:1px solid #ff00b3;border-radius:10px;background:#211421;color:#fff;font:14px Arial,sans-serif;box-shadow:0 0 16px #ff00b3;opacity:0;transition:transform .5s ease,opacity .5s ease;";
      body.appendChild(warning);

      const showWarning = () => {
        warning.style.transform = "translate(-50%,0)";
        warning.style.opacity = "1";
        window.setTimeout(() => {
          warning.style.transform = "translate(-50%,150%)";
          warning.style.opacity = "0";
        }, 5000);
      };

      window.setTimeout(showWarning, 120000);
      window.setInterval(showWarning, 120000);
    });
  }
};

window.initializeKillbytePageSettings();
