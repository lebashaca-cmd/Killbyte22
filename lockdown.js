(() => {
  const stateCacheKey = "killbyte-site-lockdown-state";
  const unlockSessionKey = "killbyte-site-lockdown-unlocked";
  const client = window.KillbyteSupabaseClient;
  const isAdminPage = /\/admin\.html$/i.test(window.location.pathname);
  let overlay;
  let input;
  let feedback;
  let submitButton;
  let locked = false;
  let checking = false;
  let adminBypass = false;
  const inertElements = new Map();

  function setLocked(nextLocked) {
    if (adminBypass) return;
    locked = nextLocked;
    if (nextLocked) {
      if (!overlay) createOverlay();
      overlay.hidden = false;
      document.documentElement.classList.add("site-locked");
      Array.from(document.body.children).forEach((element) => {
        if (element !== overlay) {
          if (!inertElements.has(element)) inertElements.set(element, element.inert);
          element.inert = true;
        }
      });
      window.setTimeout(() => input?.focus(), 0);
      return;
    }

    overlay?.remove();
    overlay = null;
    document.documentElement.classList.remove("site-locked");
    inertElements.forEach((wasInert, element) => {
      if (element.isConnected) element.inert = wasInert;
    });
    inertElements.clear();
  }

  function createOverlay() {
    overlay = document.createElement("section");
    overlay.className = "site-lockdown-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "site-lockdown-title");

    const panel = document.createElement("div");
    panel.className = "site-lockdown-panel";
    const heading = document.createElement("h1");
    heading.id = "site-lockdown-title";
    heading.textContent = "Site locked";
    const explanation = document.createElement("p");
    explanation.textContent = "Enter the four-digit access code to continue.";

    const form = document.createElement("form");
    form.className = "site-lockdown-form";
    input = document.createElement("input");
    input.type = "password";
    input.inputMode = "numeric";
    input.autocomplete = "one-time-code";
    input.pattern = "[0-9]{4}";
    input.maxLength = 4;
    input.required = true;
    input.setAttribute("aria-label", "Four-digit access code");
    input.setAttribute("aria-describedby", "site-lockdown-feedback");
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 4);
      if (input.value.length === 4) form.requestSubmit();
    });

    submitButton = document.createElement("button");
    submitButton.type = "submit";
    submitButton.className = "enter-button";
    submitButton.textContent = "Unlock";
    feedback = document.createElement("p");
    feedback.id = "site-lockdown-feedback";
    feedback.className = "site-lockdown-feedback";
    feedback.setAttribute("role", "status");
    form.addEventListener("submit", onSubmitCode);
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") event.preventDefault();
    });
    form.append(input, submitButton, feedback);
    panel.append(heading, explanation, form);
    overlay.append(panel);
    document.body.append(overlay);
  }

  async function onSubmitCode(event) {
    event.preventDefault();
    if (checking || !client || input.value.length !== 4) return;
    checking = true;
    submitButton.disabled = true;
    feedback.textContent = "Checking code…";

    try {
      const cachedState = JSON.parse(localStorage.getItem(stateCacheKey) || "{}");
      const { data: valid, error } = await client.rpc("verify_site_lockdown_code", {
        p_code: input.value,
        p_revision: cachedState.revision
      });
      if (error) throw error;
      if (!valid) {
        input.value = "";
        input.setAttribute("aria-invalid", "true");
        feedback.textContent = "That code is incorrect. Try again.";
        input.focus();
        return;
      }

      input.removeAttribute("aria-invalid");
      sessionStorage.setItem(unlockSessionKey, String(cachedState.revision));
      feedback.textContent = "";
      setLocked(false);
    } catch (error) {
      console.error("Could not verify the site lockdown code.", error);
      feedback.textContent = "Could not verify the code. Check your connection and try again.";
    } finally {
      checking = false;
      if (submitButton) submitButton.disabled = false;
    }
  }

  async function canAdminBypass() {
    if (!isAdminPage || !client) return false;
    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session?.user) return false;
      const { data: roles, error: rolesError } = await client
        .from("user_role_assignments")
        .select("role")
        .eq("user_id", sessionData.session.user.id);
      if (rolesError) throw rolesError;
      return roles.some((entry) => ["admin", "owner"].includes(entry.role));
    } catch (error) {
      console.error("Could not verify admin lockdown bypass.", error);
      return false;
    }
  }

  async function refresh() {
    if (!client) {
      if (locked) feedback.textContent = "The account service is unavailable. The site remains locked.";
      return;
    }
    try {
      const { data, error } = await client.rpc("get_site_lockdown_state");
      if (error) throw error;
      const state = {
        enabled: Boolean(data?.enabled),
        revision: Number(data?.revision || 0)
      };
      localStorage.setItem(stateCacheKey, JSON.stringify(state));
      if (!state.enabled) {
        sessionStorage.removeItem(unlockSessionKey);
        setLocked(false);
        return;
      }
      if (sessionStorage.getItem(unlockSessionKey) === String(state.revision)) {
        setLocked(false);
        return;
      }
      sessionStorage.removeItem(unlockSessionKey);
      if (locked) {
        feedback.textContent = "";
        input.value = "";
      }
      setLocked(true);
    } catch (error) {
      console.error("Could not load site lockdown state.", error);
      if (locked) feedback.textContent = "Could not check the lock. The site remains locked.";
    }
  }

  window.KillbyteLockdown = { refresh };

  (async () => {
    adminBypass = await canAdminBypass();
    if (adminBypass) {
      setLocked(false);
      return;
    }

    try {
      const cachedState = JSON.parse(localStorage.getItem(stateCacheKey) || "{}");
      if (cachedState.enabled && sessionStorage.getItem(unlockSessionKey) !== String(cachedState.revision)) {
        setLocked(true);
      }
    } catch (error) {
      console.error("Could not read cached site lockdown state.", error);
    }

    await refresh();
    window.setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void refresh();
    });
  })();
})();
