(() => {
  const getDisplayName = (user) => {
    const metadataName = user.user_metadata?.display_name;
    const fallbackName = user.email?.split("@")[0] || "Member";
    const name = typeof metadataName === "string" && metadataName.trim() ? metadataName.trim() : fallbackName;
    return Array.from(name).slice(0, 32).join("");
  };

  let client = null;
  let currentUser = null;
  let authInitializationError = null;
  let accountFormCleanup = null;

  const isConfigured =
    typeof window.KILLBYTE_SUPABASE_URL === "string" &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(window.KILLBYTE_SUPABASE_URL) &&
    typeof window.KILLBYTE_SUPABASE_ANON_KEY === "string" &&
    window.KILLBYTE_SUPABASE_ANON_KEY.length > 20 &&
    window.KILLBYTE_SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY";

  const updateAccountLink = () => {
    const nav = document.querySelector(".page-nav");
    if (!nav) return;

    let link = nav.querySelector(".site-account-link");
    if (!link) {
      link = document.createElement("a");
      link.className = "site-account-link";
      link.href = "account.html";
      nav.appendChild(link);
    }

    link.textContent = currentUser ? "Profile" : "Account";
    link.title = currentUser ? `Signed in as ${getDisplayName(currentUser)}` : "Sign in or create an account";
    if (new URL(link.href, location.href).pathname === location.pathname) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  };

  const showAccountStatus = (message, isError = false) => {
    const status = document.getElementById("account-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.error = String(isError);
  };

  const updateAccountPage = () => {
    updateAccountLink();
    const setup = document.getElementById("account-setup");
    const auth = document.getElementById("account-auth");
    const profile = document.getElementById("account-profile");
    if (!setup || !auth || !profile) return;

    if (!isConfigured || !client) {
      setup.hidden = false;
      auth.hidden = true;
      profile.hidden = true;
      if (isConfigured && !window.supabase?.createClient) {
        showAccountStatus("The account service did not load. Check your connection and refresh this page.", true);
      } else {
        showAccountStatus("Add your Supabase project settings to enable accounts.", true);
      }
      return;
    }

    setup.hidden = true;
    if (currentUser) {
      auth.hidden = true;
      profile.hidden = false;
      document.getElementById("account-profile-name").textContent = getDisplayName(currentUser);
      document.getElementById("account-profile-email").textContent = currentUser.email || "";
      if (!authInitializationError) showAccountStatus("Your Killbyte account is ready.");
    } else {
      auth.hidden = false;
      profile.hidden = true;
      if (!authInitializationError) showAccountStatus("Sign in or create a Killbyte account.");
    }
  };

  const setAccountMode = (mode) => {
    const signingUp = mode === "signup";
    const nameField = document.getElementById("account-name-field");
    const nameInput = document.getElementById("account-display-name");
    const password = document.getElementById("account-password");
    const submit = document.getElementById("account-submit");
    const signInTab = document.getElementById("account-signin-tab");
    const signUpTab = document.getElementById("account-signup-tab");
    if (!nameField || !nameInput || !password || !submit || !signInTab || !signUpTab) return;

    nameField.hidden = !signingUp;
    nameInput.required = signingUp;
    password.autocomplete = signingUp ? "new-password" : "current-password";
    submit.textContent = signingUp ? "Create account" : "Sign in";
    signInTab.setAttribute("aria-selected", String(!signingUp));
    signUpTab.setAttribute("aria-selected", String(signingUp));
  };

  window.initializeKillbyteAccountPage = () => {
    updateAccountPage();
    if (accountFormCleanup) accountFormCleanup();

    const form = document.getElementById("account-form");
    const signInTab = document.getElementById("account-signin-tab");
    const signUpTab = document.getElementById("account-signup-tab");
    const signOut = document.getElementById("account-signout");
    if (!form || !signInTab || !signUpTab || !signOut) return;

    let mode = "signin";
    const onSignIn = () => {
      mode = "signin";
      setAccountMode(mode);
    };

    window.addEventListener("killbyte:beforeNavigate", () => {
      if (accountFormCleanup) accountFormCleanup();
    });
    const onSignUp = () => {
      mode = "signup";
      setAccountMode(mode);
    };
    const onSubmit = async (event) => {
      event.preventDefault();
      const submit = document.getElementById("account-submit");
      submit.disabled = true;

      try {
        const email = document.getElementById("account-email").value.trim();
        const password = document.getElementById("account-password").value;
        let result;
        if (mode === "signup") {
          const displayName = document.getElementById("account-display-name").value.trim();
          if (displayName.length < 2) {
            showAccountStatus("Display names must be at least 2 characters.", true);
            return;
          }
          result = await client.auth.signUp({
            email,
            password,
            options: { data: { display_name: displayName } }
          });
        } else {
          result = await client.auth.signInWithPassword({ email, password });
        }

        if (result.error) {
          showAccountStatus(result.error.message, true);
        } else if (mode === "signup" && !result.data.session) {
          showAccountStatus("Account created. Check your email to confirm it, then sign in.");
          form.reset();
          mode = "signin";
          setAccountMode(mode);
        } else {
          showAccountStatus(mode === "signup" ? "Account created. Welcome to Killbyte!" : "Signed in.");
          form.reset();
        }
      } catch (error) {
        console.error("Could not complete the account request.", error);
        showAccountStatus("The account request failed. Check your connection and try again.", true);
      } finally {
        submit.disabled = false;
      }
    };
    const onSignOut = async () => {
      signOut.disabled = true;
      try {
        const { error } = await client.auth.signOut();
        if (error) showAccountStatus(`Could not sign out: ${error.message}`, true);
        else showAccountStatus("You are signed out.");
      } catch (error) {
        console.error("Could not sign out.", error);
        showAccountStatus("Could not sign out. Check your connection and try again.", true);
      } finally {
        signOut.disabled = false;
      }
    };

    signInTab.addEventListener("click", onSignIn);
    signUpTab.addEventListener("click", onSignUp);
    form.addEventListener("submit", onSubmit);
    signOut.addEventListener("click", onSignOut);
    setAccountMode(mode);
    accountFormCleanup = () => {
      signInTab.removeEventListener("click", onSignIn);
      signUpTab.removeEventListener("click", onSignUp);
      form.removeEventListener("submit", onSubmit);
      signOut.removeEventListener("click", onSignOut);
      accountFormCleanup = null;
    };
  };

  if (isConfigured && window.supabase?.createClient) {
    client = window.supabase.createClient(window.KILLBYTE_SUPABASE_URL, window.KILLBYTE_SUPABASE_ANON_KEY);
    window.KillbyteSupabaseClient = client;
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        currentUser = session?.user || null;
        authInitializationError = null;
        updateAccountPage();
      }, 0);
    });
    window.killbyteAccountAuthSubscription = listener.subscription;
    client.auth.getSession().then(({ data, error }) => {
      if (error) {
        authInitializationError = error;
        showAccountStatus(`Could not check your account: ${error.message}`, true);
        return;
      }
      currentUser = data.session?.user || null;
      updateAccountPage();
    }).catch((error) => {
      console.error("Could not check the Killbyte account session.", error);
      authInitializationError = error;
      showAccountStatus("Could not check your account. Check your connection and refresh the page.", true);
    });
  }

  window.initializeKillbyteAccountPage();
})();
