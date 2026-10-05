(() => {
  window.killbyteAdminCleanup?.();

  const status = document.getElementById("admin-status");
  const dashboard = document.getElementById("admin-dashboard");
  if (!status || !dashboard) return;

  let disposed = false;
  let authSubscription = null;
  const client = window.KillbyteSupabaseClient;
  const lockdownForm = document.getElementById("admin-lockdown-form");
  const lockdownToggle = document.getElementById("admin-lockdown-enabled");
  const lockdownCodeInput = document.getElementById("admin-lockdown-code");
  const lockdownSaveButton = lockdownForm.querySelector("button[type='submit']");

  const showStatus = (message, isError = false) => {
    status.textContent = message;
    status.dataset.error = String(isError);
  };

  const loadLockdownSettings = async () => {
    const { data, error } = await client.rpc("get_site_lockdown_state");
    if (error) throw error;
    lockdownToggle.checked = Boolean(data?.enabled);
  };

  lockdownForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    lockdownSaveButton.disabled = true;
    showStatus("Saving site lockdown settings…");
    const code = lockdownCodeInput.value;
    try {
      const { error } = await client.rpc("set_site_lockdown", {
        p_enabled: lockdownToggle.checked,
        p_code: code || null
      });
      if (error) throw error;
      lockdownCodeInput.value = "";
      await loadLockdownSettings();
      await window.KillbyteLockdown?.refresh();
      showStatus(lockdownToggle.checked
        ? "Lockdown is enabled. Visitors will need the four-digit code."
        : "Lockdown is disabled.");
    } catch (error) {
      console.error("Could not save site lockdown settings.", error);
      showStatus(`Could not save lockdown settings: ${error.message || "Check your connection."}`, true);
    } finally {
      lockdownSaveButton.disabled = false;
    }
  });

  const loadDashboard = async (session) => {
    dashboard.hidden = true;
    if (!session?.user) {
      showStatus("Sign in with an admin or owner account to continue.", true);
      return;
    }

    try {
      const { data, error } = await client
        .from("user_role_assignments")
        .select("role")
        .eq("user_id", session.user.id);
      if (error) throw error;
      if (disposed) return;
      const userRoles = data.map((entry) => entry.role);
      if (!userRoles.some((role) => ["admin", "owner"].includes(role))) {
        showStatus("This panel is only available to admins and owners.", true);
        return;
      }

      const { data: roles, error: rolesError } = await client
        .from("user_role_assignments")
        .select("role");
      if (rolesError) throw rolesError;
      if (disposed) return;

      document.getElementById("admin-current-role").textContent =
        userRoles.includes("owner") ? "Owner" : "Admin";
      document.getElementById("admin-count").textContent =
        String(roles.filter((entry) => entry.role === "admin").length);
      document.getElementById("owner-count").textContent =
        String(roles.filter((entry) => entry.role === "owner").length);
      dashboard.hidden = false;
      try {
        await loadLockdownSettings();
        if (disposed) return;
        showStatus("Admin access verified.");
      } catch (error) {
        console.error("Could not load site lockdown settings.", error);
        showStatus("Admin access verified, but lockdown settings are unavailable. Run the updated supabase-chat.sql setup.", true);
      }
    } catch (error) {
      console.error("Could not load the admin dashboard.", error);
      showStatus(`Could not load the admin dashboard: ${error.message || "Check your connection."}`, true);
    }
  };

  const onBeforeNavigate = () => window.killbyteAdminCleanup?.();
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("killbyte:beforeNavigate", onBeforeNavigate);
    authSubscription?.unsubscribe();
    if (window.killbyteAdminCleanup === cleanup) delete window.killbyteAdminCleanup;
  };

  window.killbyteAdminCleanup = cleanup;
  window.addEventListener("killbyte:beforeNavigate", onBeforeNavigate);

  if (!client) {
    showStatus("The account service is unavailable. Check your Supabase setup.", true);
    return;
  }

  const { data: authListener } = client.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => {
      if (!disposed) void loadDashboard(session);
    }, 0);
  });
  authSubscription = authListener.subscription;

  void client.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    if (!disposed) return loadDashboard(data.session);
  }).catch((error) => {
    console.error("Could not verify admin access.", error);
    showStatus(`Could not verify admin access: ${error.message || "Check your connection."}`, true);
  });
})();
