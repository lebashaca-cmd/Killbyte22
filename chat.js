(() => {
  window.killbyteChatCleanup?.();

  const status = document.getElementById("chat-status");
  const setup = document.getElementById("chat-setup");
  const authPanel = document.getElementById("chat-auth");
  const chatPanel = document.getElementById("chat-panel");
  const messagesList = document.getElementById("chat-messages");
  const composer = document.getElementById("chat-composer");
  const messageInput = document.getElementById("chat-message-input");
  const roomButtons = Array.from(document.querySelectorAll(".chat-room-button[data-room]"));

  if (!status || !setup || !authPanel || !chatPanel || roomButtons.length === 0) return;

  let channel = null;
  let authSubscription = null;
  let activeUserId = null;
  let activeRoom = "general";
  let roomRequestId = 0;
  let messages = new Map();
  let profileCache = new Map();
  let roleCache = new Map();
  let profilesLoading = new Map();
  let disposed = false;
  const profileDialog = document.getElementById("chat-user-profile");

  const showStatus = (message, isError = false) => {
    status.textContent = message;
    status.dataset.error = String(isError);
    status.hidden = !message;
  };

  const getDisplayName = (user) => {
    const metadataName = user.user_metadata?.display_name;
    const fallbackName = user.email?.split("@")[0] || "Member";
    const name = typeof metadataName === "string" && metadataName.trim() ? metadataName.trim() : fallbackName;
    return Array.from(name).slice(0, 32).join("");
  };

  const getSafeImageUrl = (value) => {
    if (typeof value !== "string" || !value) return "";
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch {
      return "";
    }
  };

  const loadProfiles = async (userIds) => {
    const uniqueIds = [...new Set(userIds)].filter((id) => typeof id === "string" && id);
    const requestedIds = uniqueIds.filter((id) => !profileCache.has(id) && !profilesLoading.has(id));
    const pendingRequests = uniqueIds
      .filter((id) => profilesLoading.has(id))
      .map((id) => profilesLoading.get(id));
    let request = Promise.resolve(true);

    if (requestedIds.length) {
      request = (async () => {
        try {
          const [profileResult, roleResult] = await Promise.all([
            client
              .from("user_profiles")
              .select("user_id, display_name, bio, avatar_url, banner_url")
              .in("user_id", requestedIds),
            client
              .from("user_role_assignments")
              .select("user_id, role")
              .in("user_id", requestedIds)
          ]);
          if (profileResult.error) throw profileResult.error;
          if (roleResult.error) throw roleResult.error;
          requestedIds.forEach((id) => {
            profileCache.set(id, null);
            roleCache.set(id, []);
          });
          profileResult.data.forEach((profile) => profileCache.set(profile.user_id, profile));
          roleResult.data.forEach((entry) => {
            const roles = roleCache.get(entry.user_id) || [];
            roles.push(entry.role);
            roleCache.set(entry.user_id, roles);
          });
          if (!disposed) renderMessages();
          return true;
        } catch (error) {
          console.error("Could not load chat user profiles.", error);
          showStatus("Profile details could not be loaded. Check the chat SQL setup and try again.", true);
          return false;
        }
      })();
      requestedIds.forEach((id) => profilesLoading.set(id, request));
    }

    const succeeded = (await Promise.all([request, ...pendingRequests])).every(Boolean);
    requestedIds.forEach((id) => {
      if (profilesLoading.get(id) === request) profilesLoading.delete(id);
    });
    return succeeded;
  };

  const showUserProfile = async (userId, fallbackName) => {
    if (!userId || !profileDialog) return;
    if (!(await loadProfiles([userId])) || disposed) return;

    const profile = profileCache.get(userId);
    const assignedRoles = roleCache.get(userId) || [];
    const roles = (assignedRoles.length ? assignedRoles : ["member"])
      .sort((first, second) => ["owner", "admin", "beta", "member"].indexOf(first) -
        ["owner", "admin", "beta", "member"].indexOf(second));
    const displayName = profile?.display_name || fallbackName || "Member";
    const avatar = document.getElementById("chat-user-profile-avatar");
    const initial = document.getElementById("chat-user-profile-initial");
    const banner = document.getElementById("chat-user-profile-banner");
    const avatarUrl = getSafeImageUrl(profile?.avatar_url);
    const bannerUrl = getSafeImageUrl(profile?.banner_url);
    const profileName = document.getElementById("chat-user-profile-name");
    profileName.textContent = displayName;
    profileName.dataset.role = roles.includes("owner") ? "owner" : roles.includes("admin") ? "admin" : "member";
    const rolesList = document.getElementById("chat-user-profile-roles");
    rolesList.replaceChildren();
    roles.forEach((role) => {
      const tag = document.createElement("span");
      tag.className = "profile-role-tag";
      tag.dataset.role = role;
      tag.textContent = role.charAt(0).toUpperCase() + role.slice(1);
      rolesList.appendChild(tag);
    });
    document.getElementById("chat-user-profile-bio").textContent =
      profile?.bio || (profile ? "No bio yet." : "This user has not set up a public profile yet.");
    avatar.hidden = !avatarUrl;
    avatar.removeAttribute("src");
    avatar.onerror = () => {
      avatar.hidden = true;
      initial.hidden = false;
    };
    if (avatarUrl) avatar.src = avatarUrl;
    initial.hidden = Boolean(avatarUrl);
    initial.textContent = Array.from(displayName)[0] || "?";
    banner.hidden = !bannerUrl;
    banner.removeAttribute("src");
    banner.onerror = () => {
      banner.hidden = true;
    };
    if (bannerUrl) banner.src = bannerUrl;
    if (!profile) showStatus("This user has not added public profile details yet.");
    else showStatus("");
    profileDialog.showModal();
  };

  const renderMessages = () => {
    const orderedMessages = Array.from(messages.values())
      .sort((first, second) => new Date(first.created_at) - new Date(second.created_at))
      .slice(-100);
    messages = new Map(orderedMessages.map((message) => [message.id, message]));
    messagesList.replaceChildren();

    if (orderedMessages.length === 0) {
      const emptyMessage = document.createElement("li");
      emptyMessage.className = "chat-empty";
      emptyMessage.textContent = "No messages yet. Start the conversation!";
      messagesList.appendChild(emptyMessage);
      return;
    }

    orderedMessages.forEach((message) => {
      const item = document.createElement("li");
      item.className = "chat-message";
      item.dataset.own = String(message.user_id === activeUserId);

      const metadata = document.createElement("div");
      metadata.className = "chat-message-meta";
      const profile = profileCache.get(message.user_id);
      const roles = roleCache.get(message.user_id) || [];
      const glowRole = roles.includes("owner") ? "owner" : roles.includes("admin") ? "admin" : "member";
      const displayName = profile?.display_name || message.username;
      const author = document.createElement("button");
      author.type = "button";
      author.className = "chat-message-author";
      author.dataset.role = glowRole;
      author.dataset.userId = message.user_id;
      author.dataset.username = message.username;
      author.setAttribute("aria-label", `View ${displayName}'s profile`);
      const avatarUrl = getSafeImageUrl(profile?.avatar_url);
      if (avatarUrl) {
        const avatar = document.createElement("img");
        avatar.className = "chat-message-avatar";
        avatar.src = avatarUrl;
        avatar.alt = "";
        avatar.loading = "lazy";
        author.appendChild(avatar);
      } else {
        const initial = document.createElement("span");
        initial.className = "chat-message-avatar chat-message-initial";
        initial.textContent = Array.from(displayName)[0] || "?";
        author.appendChild(initial);
      }
      const authorName = document.createElement("span");
      authorName.textContent = displayName;
      author.appendChild(authorName);
      const time = document.createElement("time");
      const createdAt = new Date(message.created_at);
      time.dateTime = createdAt.toISOString();
      time.textContent = createdAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      metadata.append(author, time);

      const body = document.createElement("p");
      body.textContent = message.content;
      item.append(metadata, body);
      messagesList.appendChild(item);
    });

    messagesList.scrollTop = messagesList.scrollHeight;
    void loadProfiles(orderedMessages.map((message) => message.user_id));
  };

  const stopRealtime = async () => {
    if (!channel) return;
    const activeChannel = channel;
    channel = null;
    try {
      const result = await client.removeChannel(activeChannel);
      if (result !== "ok") console.error("Could not close the chat updates subscription.", result);
    } catch (error) {
      console.error("Could not close the chat updates subscription.", error);
    }
  };

  const startRealtime = async (user) => {
    if (activeUserId !== user.id) {
      await stopRealtime();
      activeUserId = user.id;
      messages = new Map();
      profileCache = new Map();
      roleCache = new Map();
      profilesLoading = new Map();
      renderMessages();
    }

    chatPanel.hidden = false;
    authPanel.hidden = true;
    setup.hidden = true;

    if (channel) return;
    const room = activeRoom;
    const currentChannel = client
      .channel(`killbyte-${room}-messages`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `room=eq.${room}` },
        ({ new: message }) => {
          if (disposed || activeRoom !== room || !message?.id) return;
          messages.set(message.id, message);
          renderMessages();
        }
      )
      .subscribe((subscriptionStatus) => {
        if (disposed || activeRoom !== room) return;
        if (subscriptionStatus === "CHANNEL_ERROR" || subscriptionStatus === "TIMED_OUT") {
          showStatus("Live updates could not connect. Check Supabase Realtime setup and your connection.", true);
        }
      });
    channel = currentChannel;

    const { data, error } = await client
      .from("chat_messages")
      .select("id, user_id, username, content, room, created_at")
      .eq("room", room)
      .order("created_at", { ascending: false })
      .limit(100);

    if (disposed || activeUserId !== user.id || activeRoom !== room) return;
    if (error) {
      showStatus(`Could not load chat messages: ${error.message}`, true);
      return;
    }

    data.reverse().forEach((message) => messages.set(message.id, message));
    renderMessages();
  };

  const clearSession = async () => {
    await stopRealtime();
    activeUserId = null;
    messages = new Map();
    messagesList.replaceChildren();
    chatPanel.hidden = true;
    authPanel.hidden = false;
  };

  const onSendMessage = async (event) => {
    event.preventDefault();
    const content = messageInput.value.trim();
    if (!content || !activeUserId) return;
    const room = activeRoom;

    let userResult;
    let userError;
    try {
      ({ data: userResult, error: userError } = await client.auth.getUser());
    } catch (error) {
      console.error("Could not verify the chat session.", error);
      showStatus("Could not verify your session. Check your connection and try again.", true);
      return;
    }
    if (userError || !userResult.user) {
      showStatus(userError?.message || "Your session has expired. Please sign in again.", true);
      await clearSession();
      return;
    }

    const username = getDisplayName(userResult.user);
    const sendButton = composer.querySelector("button[type='submit']");
    sendButton.disabled = true;
    messageInput.disabled = true;

    try {
      const { data, error } = await client
        .from("chat_messages")
        .insert({ user_id: userResult.user.id, username, content, room })
        .select("id, user_id, username, content, room, created_at")
        .single();

      if (error) {
        showStatus(`Message was not sent: ${error.message}`, true);
        return;
      }

      if (activeRoom === room) {
        messages.set(data.id, data);
        renderMessages();
      }
      messageInput.value = "";
      showStatus("");
      messageInput.focus();
    } catch (error) {
      console.error("Could not send the chat message.", error);
      showStatus("Message was not sent. Check your connection and try again.", true);
    } finally {
      sendButton.disabled = false;
      messageInput.disabled = false;
    }
  };

  const onBeforeNavigate = () => window.killbyteChatCleanup?.();
  const onAuthorClick = (event) => {
    const author = event.target.closest(".chat-message-author");
    if (author) void showUserProfile(author.dataset.userId, author.dataset.username);
  };
  const onCloseProfile = () => profileDialog?.close();
  const onProfileBackdropClick = (event) => {
    if (event.target === profileDialog) profileDialog.close();
  };
  const onRoomSelect = async (event) => {
    const selectedRoom = event.currentTarget.dataset.room;
    if (selectedRoom === activeRoom) return;

    activeRoom = selectedRoom;
    roomRequestId += 1;
    roomButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.room === activeRoom));
    });
    chatPanel.setAttribute("aria-label", `${activeRoom} chat`);
    messageInput.placeholder = `Message #${activeRoom}...`;
    messages = new Map();
    renderMessages();
    showStatus("");

    if (!activeUserId) return;
    const requestId = roomRequestId;
    try {
      await stopRealtime();
      if (disposed || requestId !== roomRequestId) return;
      const { data, error } = await client.auth.getSession();
      if (error) {
        showStatus(`Could not check your account: ${error.message}`, true);
        return;
      }
      if (disposed || requestId !== roomRequestId || !data.session?.user) return;
      await startRealtime(data.session.user);
    } catch (error) {
      console.error("Could not switch chat rooms.", error);
      showStatus("Could not switch rooms. Check your connection and try again.", true);
    }
  };
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("killbyte:beforeNavigate", onBeforeNavigate);
    composer.removeEventListener("submit", onSendMessage);
    messagesList.removeEventListener("click", onAuthorClick);
    profileDialog?.querySelector(".user-profile-close").removeEventListener("click", onCloseProfile);
    profileDialog?.removeEventListener("click", onProfileBackdropClick);
    roomButtons.forEach((button) => button.removeEventListener("click", onRoomSelect));
    if (authSubscription) authSubscription.unsubscribe();
    void stopRealtime();
    if (window.killbyteChatCleanup === cleanup) delete window.killbyteChatCleanup;
  };

  window.killbyteChatCleanup = cleanup;
  window.addEventListener("killbyte:beforeNavigate", onBeforeNavigate);
  composer.addEventListener("submit", onSendMessage);
  messagesList.addEventListener("click", onAuthorClick);
  profileDialog?.querySelector(".user-profile-close").addEventListener("click", onCloseProfile);
  profileDialog?.addEventListener("click", onProfileBackdropClick);
  roomButtons.forEach((button) => button.addEventListener("click", onRoomSelect));
  chatPanel.setAttribute("aria-label", `${activeRoom} chat`);
  messageInput.placeholder = `Message #${activeRoom}...`;

  const client = window.KillbyteSupabaseClient;
  if (!client) {
    const hasConfiguration =
      typeof window.KILLBYTE_SUPABASE_URL === "string" &&
      /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(window.KILLBYTE_SUPABASE_URL) &&
      typeof window.KILLBYTE_SUPABASE_ANON_KEY === "string" &&
      window.KILLBYTE_SUPABASE_ANON_KEY.length > 20 &&
      window.KILLBYTE_SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY";
    setup.hidden = false;
    showStatus(
      hasConfiguration
        ? "The account service did not load. Check your connection and refresh this page."
        : "Chat is not connected yet. Finish the Supabase setup to enable it.",
      true
    );
    return;
  }

  const handleAuthChange = (session) => {
    if (disposed) return;
    if (session?.user) {
      void startRealtime(session.user).catch((error) => {
        console.error("Could not open the chat room.", error);
        showStatus("Could not open chat. Check your connection and Supabase setup.", true);
      });
    } else {
      void clearSession().catch((error) => {
        console.error("Could not clear the chat session.", error);
        showStatus("Could not finish signing out. Refresh the page and try again.", true);
      });
      showStatus("Sign in to join chat.");
    }
  };

  const { data: authListener } = client.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => handleAuthChange(session), 0);
  });
  authSubscription = authListener.subscription;

  void client.auth.getSession().then(({ data, error }) => {
    if (error) {
      showStatus(`Could not check your account: ${error.message}`, true);
      return;
    }
    if (!data.session) {
      authPanel.hidden = false;
      showStatus("Sign in to join chat.");
      return;
    }
    void handleAuthChange(data.session);
  }).catch((error) => {
    console.error("Could not check the chat account session.", error);
    showStatus("Could not check your account. Check your connection and refresh the page.", true);
  });
})();
