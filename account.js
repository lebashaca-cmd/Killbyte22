(() => {
  const getDisplayName = (user) => {
    const metadataName = user.user_metadata?.display_name;
    const fallbackName = user.email?.split("@")[0] || "Member";
    const name = typeof metadataName === "string" && metadataName.trim() ? metadataName.trim() : fallbackName;
    return Array.from(name).slice(0, 32).join("");
  };

  let client = null;
  let currentUser = null;
  let currentRole = null;
  let currentRoleUserId = null;
  let roleLoadPromise = null;
  let roleLoadUserId = null;
  let authInitializationError = null;
  let accountFormCleanup = null;
  let profileLoadedUserId = null;
  let profileSaveInProgress = false;
  let profileImageUrls = { avatar: "", banner: "" };
  let profilePreviewObjectUrls = { avatar: "", banner: "" };

  const isConfigured =
    typeof window.KILLBYTE_SUPABASE_URL === "string" &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(window.KILLBYTE_SUPABASE_URL) &&
    typeof window.KILLBYTE_SUPABASE_ANON_KEY === "string" &&
    window.KILLBYTE_SUPABASE_ANON_KEY.length > 20 &&
    window.KILLBYTE_SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY";

  const updateAdminLink = async () => {
    const nav = document.querySelector(".sidebar-beta-section");
    if (!nav) return;

    let link = nav.querySelector(".site-admin-link");
    if (!link) {
      link = document.createElement("a");
      link.className = "site-admin-link";
      link.href = "admin.html";
      link.textContent = "Admin panel";
      nav.appendChild(link);
    }
    link.hidden = true;
    link.removeAttribute("aria-current");
    if (!client || !currentUser) return;

    if (currentRoleUserId === currentUser.id) {
      link.hidden = !currentRole.some((role) => ["admin", "owner"].includes(role));
    } else if (roleLoadUserId !== currentUser.id) {
      const userId = currentUser.id;
      const request = client
        .from("user_role_assignments")
        .select("role")
        .eq("user_id", userId)
        .then(({ data, error }) => {
          if (error) throw error;
          if (currentUser?.id === userId) {
            currentRole = data.map((entry) => entry.role);
            currentRoleUserId = userId;
          }
        })
        .catch((error) => {
          console.error("Could not check account role.", error);
          if (currentUser?.id === userId) {
            currentRole = [];
            currentRoleUserId = userId;
          }
        });
      roleLoadPromise = request;
      roleLoadUserId = userId;
      request.finally(() => {
        if (roleLoadPromise === request) {
          roleLoadPromise = null;
          roleLoadUserId = null;
        }
        if (currentUser?.id === userId) void updateAdminLink();
      });
    }

    if (link.hidden === false && new URL(link.href, location.href).pathname === location.pathname) {
      link.setAttribute("aria-current", "page");
    }
  };

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
    void updateAdminLink();
  };

  const showAccountStatus = (message, isError = false) => {
    const status = document.getElementById("account-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.error = String(isError);
  };

  const getPublicImageUrl = (value) => {
    if (!value) return "";
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
    } catch {
      return null;
    }
  };

  const setProfileImagePreview = (kind, value) => {
    const image = document.getElementById(`account-profile-${kind}-preview`);
    if (!image) return;

    const safeUrl = getPublicImageUrl(value);
    image.hidden = !safeUrl;
    if (safeUrl) image.src = safeUrl;
    else image.removeAttribute("src");
  };

  const uploadProfileImage = async (kind, file) => {
    const { data, error } = await client.storage
      .from("killbyte-profile-images")
      .upload(`${currentUser.id}/${kind}`, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: true
      });
    if (error) throw error;

    const { data: publicData } = client.storage
      .from("killbyte-profile-images")
      .getPublicUrl(data.path);
    return `${publicData.publicUrl}?v=${Date.now()}`;
  };

  const loadAccountProfile = async (user) => {
    if (!client || !user || profileLoadedUserId === user.id) return;

    try {
      const { data, error } = await client
        .from("user_profiles")
        .select("display_name, bio, avatar_url, banner_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (currentUser?.id !== user.id) return;

      document.getElementById("account-profile-display-name").value =
        data?.display_name || getDisplayName(user);
      document.getElementById("account-profile-bio").value = data?.bio || "";
      profileImageUrls = {
        avatar: getPublicImageUrl(data?.avatar_url) || "",
        banner: getPublicImageUrl(data?.banner_url) || ""
      };
      setProfileImagePreview("avatar", profileImageUrls.avatar);
      setProfileImagePreview("banner", profileImageUrls.banner);
      profileLoadedUserId = user.id;
    } catch (error) {
      console.error("Could not load the Killbyte profile.", error);
      showAccountStatus(
        `Could not load your public profile: ${error.message || "Check the chat SQL setup and try again."}`,
        true
      );
    }
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
      if (!profileSaveInProgress) void loadAccountProfile(currentUser);
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
    const profileForm = document.getElementById("account-profile-form");
    const avatarInput = document.getElementById("account-profile-avatar");
    const bannerInput = document.getElementById("account-profile-banner");
    if (!form || !signInTab || !signUpTab || !signOut || !profileForm) return;

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
    const onProfileSave = async (event) => {
      event.preventDefault();
      if (!currentUser) return;

      const saveButton = document.getElementById("account-profile-save");
      const displayName = document.getElementById("account-profile-display-name").value.trim();
      const bio = document.getElementById("account-profile-bio").value.trim();
      const avatarFile = avatarInput.files[0] || null;
      const bannerFile = bannerInput.files[0] || null;
      const files = [avatarFile, bannerFile].filter(Boolean);
      const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
      if (displayName.length < 2 || displayName.length > 32) {
        showAccountStatus("Display names must be between 2 and 32 characters.", true);
        return;
      }
      if (files.some((file) => !allowedImageTypes.has(file.type) || file.size > 5 * 1024 * 1024)) {
        showAccountStatus("Choose JPEG, PNG, GIF, or WebP images no larger than 5 MB.", true);
        return;
      }

      saveButton.disabled = true;
      profileSaveInProgress = true;
      try {
        const avatarUrl = avatarFile ? await uploadProfileImage("avatar", avatarFile) : profileImageUrls.avatar;
        const bannerUrl = bannerFile ? await uploadProfileImage("banner", bannerFile) : profileImageUrls.banner;
        const { data: authData, error: authError } = await client.auth.updateUser({
          data: { display_name: displayName }
        });
        if (authError) throw authError;

        const { error } = await client.from("user_profiles").upsert({
          user_id: currentUser.id,
          display_name: displayName,
          bio,
          avatar_url: avatarUrl,
          banner_url: bannerUrl,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });
        if (error) throw error;

        currentUser = authData.user || currentUser;
        profileLoadedUserId = currentUser.id;
        profileImageUrls = { avatar: avatarUrl, banner: bannerUrl };
        avatarInput.value = "";
        bannerInput.value = "";
        Object.values(profilePreviewObjectUrls).forEach((url) => {
          if (url) URL.revokeObjectURL(url);
        });
        profilePreviewObjectUrls = { avatar: "", banner: "" };
        setProfileImagePreview("avatar", avatarUrl);
        setProfileImagePreview("banner", bannerUrl);
        updateAccountPage();
        showAccountStatus("Your public profile has been saved.");
      } catch (error) {
        console.error("Could not save the Killbyte profile.", error);
        showAccountStatus(`Could not save your profile: ${error.message || "Check your connection and try again."}`, true);
      } finally {
        profileSaveInProgress = false;
        saveButton.disabled = false;
      }
    };
    const makeImageChangeHandler = (kind, input) => () => {
      const file = input.files[0];
      const preview = document.getElementById(`account-profile-${kind}-preview`);
      if (!file) {
        setProfileImagePreview(kind, profileImageUrls[kind]);
        return;
      }
      if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
        input.value = "";
        if (profilePreviewObjectUrls[kind]) URL.revokeObjectURL(profilePreviewObjectUrls[kind]);
        profilePreviewObjectUrls[kind] = "";
        setProfileImagePreview(kind, profileImageUrls[kind]);
        showAccountStatus("Choose a JPEG, PNG, GIF, or WebP image no larger than 5 MB.", true);
        return;
      }

      if (profilePreviewObjectUrls[kind]) URL.revokeObjectURL(profilePreviewObjectUrls[kind]);
      profilePreviewObjectUrls[kind] = URL.createObjectURL(file);
      preview.src = profilePreviewObjectUrls[kind];
      preview.hidden = false;
    };
    const onAvatarChange = makeImageChangeHandler("avatar", avatarInput);
    const onBannerChange = makeImageChangeHandler("banner", bannerInput);

    signInTab.addEventListener("click", onSignIn);
    signUpTab.addEventListener("click", onSignUp);
    form.addEventListener("submit", onSubmit);
    signOut.addEventListener("click", onSignOut);
    profileForm.addEventListener("submit", onProfileSave);
    avatarInput.addEventListener("change", onAvatarChange);
    bannerInput.addEventListener("change", onBannerChange);
    setAccountMode(mode);
    accountFormCleanup = () => {
      signInTab.removeEventListener("click", onSignIn);
      signUpTab.removeEventListener("click", onSignUp);
      form.removeEventListener("submit", onSubmit);
      signOut.removeEventListener("click", onSignOut);
      profileForm.removeEventListener("submit", onProfileSave);
      avatarInput.removeEventListener("change", onAvatarChange);
      bannerInput.removeEventListener("change", onBannerChange);
      accountFormCleanup = null;
    };
  };

  if (isConfigured && window.supabase?.createClient) {
    client = window.supabase.createClient(window.KILLBYTE_SUPABASE_URL, window.KILLBYTE_SUPABASE_ANON_KEY);
    window.KillbyteSupabaseClient = client;
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        currentUser = session?.user || null;
        if (!currentUser || currentUser.id !== currentRoleUserId) {
          currentRole = [];
          currentRoleUserId = null;
        }
        if (!currentUser || currentUser.id !== profileLoadedUserId) profileLoadedUserId = null;
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
      if (!currentUser || currentUser.id !== currentRoleUserId) {
        currentRole = [];
        currentRoleUserId = null;
      }
      if (!currentUser || currentUser.id !== profileLoadedUserId) profileLoadedUserId = null;
      updateAccountPage();
    }).catch((error) => {
      console.error("Could not check the Killbyte account session.", error);
      authInitializationError = error;
      showAccountStatus("Could not check your account. Check your connection and refresh the page.", true);
    });
  }

  window.initializeKillbyteAccountPage();
})();
