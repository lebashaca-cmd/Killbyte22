(() => {
  window.killbyteChatCleanup?.();

  const status = document.getElementById("chat-status");
  const setup = document.getElementById("chat-setup");
  const authPanel = document.getElementById("chat-auth");
  const chatPanel = document.getElementById("chat-panel");
  const messagesList = document.getElementById("chat-messages");
  const composer = document.getElementById("chat-composer");
  const messageInput = document.getElementById("chat-message-input");
  const picker = document.getElementById("chat-composer-picker");
  const emojiButton = document.getElementById("chat-emoji-button");
  const gifButton = document.getElementById("chat-gif-button");
  const imageButton = document.getElementById("chat-image-button");
  const imageInput = document.getElementById("chat-image-input");
  const attachmentName = document.getElementById("chat-attachment-name");
  const gifSearchForm = document.getElementById("chat-gif-search");
  const gifQuery = document.getElementById("chat-gif-query");
  const gifResults = document.getElementById("chat-gif-results");
  const gifStatus = document.getElementById("chat-gif-status");
  const gifPanel = document.getElementById("chat-gif-panel");
  const emojiPanel = document.getElementById("chat-emoji-panel");
  const roomButtons = Array.from(document.querySelectorAll(".chat-room-button[data-room]"));

  if (!status || !setup || !authPanel || !chatPanel || !composer || !messageInput || roomButtons.length === 0) return;

  let channel = null;
  let authSubscription = null;
  let activeUserId = null;
  let activeRoom = "general";
  let roomRequestId = 0;
  let messages = new Map();
  let profileCache = new Map();
  let roleCache = new Map();
  let profilesLoading = new Map();
  let signedMediaUrls = new Map();
  let mediaLoading = new Map();
  let attachedImage = null;
  let attachedGifUrl = "";
  let attachedGifSlug = "";
  let attachedGifQuery = "";
  let gifSearchRequestId = 0;
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

  const getSafeKlipyUrl = (value) => {
    if (typeof value !== "string" || !value) return "";
    try {
      const url = new URL(value);
      return url.protocol === "https:" &&
        (url.hostname === "klipy.com" || url.hostname.endsWith(".klipy.com"))
        ? value
        : "";
    } catch {
      return "";
    }
  };

  const showPicker = (panelName) => {
    if (!picker) return;
    const showGif = panelName === "gif";
    picker.hidden = false;
    emojiPanel.hidden = showGif;
    gifPanel.hidden = !showGif;
    document.getElementById("chat-picker-title").textContent = showGif ? "GIFs" : "Emoji";
    emojiButton.setAttribute("aria-pressed", String(!showGif));
    gifButton.setAttribute("aria-pressed", String(showGif));
    if (showGif) {
      gifQuery.focus();
      if (!gifResults.childElementCount) void searchGifs("trending");
    }
  };

  const hidePicker = () => {
    if (!picker) return;
    picker.hidden = true;
    emojiButton.setAttribute("aria-pressed", "false");
    gifButton.setAttribute("aria-pressed", "false");
  };

  const searchGifs = async (query) => {
    const appKey = window.KILLBYTE_KLIPY_APP_KEY;
    if (typeof appKey !== "string" || !appKey.trim()) {
      gifStatus.textContent = "GIF search is not configured yet. Add your KLIPY app key to chat-config.js.";
      return;
    }
    const requestId = ++gifSearchRequestId;
    gifStatus.textContent = "Searching KLIPY…";
    gifResults.replaceChildren();

    try {
      const params = new URLSearchParams({ q: query, per_page: "24", format_filter: "gif" });
      const response = await fetch(
        `https://api.klipy.com/api/v1/${encodeURIComponent(appKey.trim())}/gifs/search?${params}`
      );
      if (!response.ok) throw new Error(`KLIPY search returned ${response.status}.`);
      const result = await response.json();
      if (disposed || requestId !== gifSearchRequestId) return;

      const items = Array.isArray(result.data?.data) ? result.data.data : [];
      items.forEach((gif) => {
        const previewUrl = getSafeKlipyUrl(
          gif.file?.sm?.gif?.url || gif.file?.md?.gif?.url || gif.file?.hd?.gif?.url
        );
        const fullUrl = getSafeKlipyUrl(gif.file?.hd?.gif?.url || gif.file?.md?.gif?.url || gif.file?.sm?.gif?.url);
        if (!previewUrl || !fullUrl) return;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chat-gif-result";
        button.setAttribute("aria-label", `Select GIF: ${gif.title || "KLIPY GIF"}`);
        const image = document.createElement("img");
        image.src = previewUrl;
        image.alt = gif.title || "GIF search result";
        image.loading = "lazy";
        button.appendChild(image);
        button.addEventListener("click", () => {
          attachedGifUrl = fullUrl;
          attachedGifSlug = gif.slug;
          attachedGifQuery = query;
          attachedImage = null;
          imageInput.value = "";
          attachmentName.textContent = "GIF selected · add a caption, then send";
          attachmentName.hidden = false;
          messageInput.placeholder = "Add a caption (optional)...";
          hidePicker();
          messageInput.focus();
        });
        gifResults.appendChild(button);
      });
      gifStatus.textContent = items.length ? "" : "No GIFs found. Try another search.";
    } catch (error) {
      console.error("Could not search KLIPY GIFs.", error);
      if (requestId === gifSearchRequestId) {
        gifStatus.textContent = "GIF search failed. Check the KLIPY app key and connection, then try again.";
      }
    }
  };

  const loadSignedMediaUrl = async (path) => {
    if (!path || signedMediaUrls.has(path) || mediaLoading.has(path)) return;
    const request = (async () => {
      try {
        const { data, error } = await client.storage
          .from("killbyte-chat-images")
          .createSignedUrl(path, 60 * 60 * 24 * 7);
        if (error) throw error;
        signedMediaUrls.set(path, data.signedUrl);
        if (!disposed) renderMessages();
      } catch (error) {
        console.error("Could not load a chat image.", error);
        showStatus("A chat image could not be loaded. Check Supabase Storage setup.", true);
      } finally {
        mediaLoading.delete(path);
      }
    })();
    mediaLoading.set(path, request);
    await request;
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

      if (message.message_type === "image" || message.message_type === "gif") {
        const mediaUrl = message.message_type === "gif"
          ? getSafeKlipyUrl(message.media_url)
          : signedMediaUrls.get(message.media_path);
        if (mediaUrl) {
          const media = document.createElement("img");
          media.className = "chat-message-media";
          media.src = mediaUrl;
          media.alt = message.message_type === "gif" ? "GIF shared in chat" : "Image shared in chat";
          media.loading = "lazy";
          item.append(metadata, media);
          if (message.content && message.content !== "[Image]" && message.content !== "[GIF]") {
            const caption = document.createElement("p");
            caption.className = "chat-message-caption";
            caption.textContent = message.content;
            item.appendChild(caption);
          }
          if (message.message_type === "gif") {
            const attribution = document.createElement("a");
            attribution.className = "chat-message-attribution";
            attribution.href = "https://klipy.com/";
            attribution.target = "_blank";
            attribution.rel = "noopener noreferrer";
            attribution.textContent = "GIF via KLIPY";
            item.appendChild(attribution);
          }
        } else {
          const loadingText = document.createElement("p");
          loadingText.className = "chat-media-loading";
          loadingText.textContent = message.message_type === "gif" ? "GIF unavailable" : "Loading image…";
          item.append(metadata, loadingText);
          if (message.message_type === "image") void loadSignedMediaUrl(message.media_path);
        }
      } else {
        const body = document.createElement("p");
        body.textContent = message.content;
        item.append(metadata, body);
      }
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
      signedMediaUrls = new Map();
      mediaLoading = new Map();
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
      .select("id, user_id, username, content, room, created_at, message_type, media_url, media_path")
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
    attachedImage = null;
    attachedGifUrl = "";
    imageInput.value = "";
    attachmentName.hidden = true;
    messagesList.replaceChildren();
    chatPanel.hidden = true;
    authPanel.hidden = false;
  };

  const onSendMessage = async (event) => {
    event.preventDefault();
    const content = messageInput.value.trim();
    if ((!content && !attachedImage && !attachedGifUrl) || !activeUserId) return;
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
    let uploadedChatImagePath = "";
    sendButton.disabled = true;
    messageInput.disabled = true;
    emojiButton.disabled = true;
    gifButton.disabled = true;
    imageButton.disabled = true;

    try {
      let messageType = "text";
      let mediaUrl = "";
      let mediaPath = "";
      if (attachedImage) {
        messageType = "image";
        const extensionByType = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/gif": "gif",
          "image/webp": "webp"
        };
        mediaPath = `${userResult.user.id}/${crypto.randomUUID()}.${extensionByType[attachedImage.type]}`;
        const { error: uploadError } = await client.storage
          .from("killbyte-chat-images")
          .upload(mediaPath, attachedImage, {
            cacheControl: "3600",
            contentType: attachedImage.type,
            upsert: false
          });
        if (uploadError) throw uploadError;
        uploadedChatImagePath = mediaPath;
      } else if (attachedGifUrl) {
        messageType = "gif";
        mediaUrl = attachedGifUrl;
      }

      const { data, error } = await client
        .from("chat_messages")
        .insert({
          user_id: userResult.user.id,
          username,
          content: content || (messageType === "gif" ? "[GIF]" : messageType === "image" ? "[Image]" : ""),
          room,
          message_type: messageType,
          media_url: mediaUrl,
          media_path: mediaPath
        })
        .select("id, user_id, username, content, room, created_at, message_type, media_url, media_path")
        .single();

      if (error) throw error;

      if (activeRoom === room) {
        messages.set(data.id, data);
        renderMessages();
      }
      messageInput.value = "";
      if (messageType === "gif" && attachedGifSlug) {
        try {
          const shareResponse = await fetch(
            `https://api.klipy.com/api/v1/${encodeURIComponent(window.KILLBYTE_KLIPY_APP_KEY.trim())}/gifs/share/${encodeURIComponent(attachedGifSlug)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                customer_id: userResult.user.id,
                q: attachedGifQuery
              })
            }
          );
          if (!shareResponse.ok) throw new Error(`KLIPY share event returned ${shareResponse.status}.`);
        } catch (error) {
          console.error("Could not record the KLIPY GIF share event.", error);
        }
      }
      attachedImage = null;
      attachedGifUrl = "";
      attachedGifSlug = "";
      attachedGifQuery = "";
      imageInput.value = "";
      attachmentName.hidden = true;
      attachmentName.textContent = "";
      messageInput.placeholder = `Message #${activeRoom}...`;
      showStatus("");
      messageInput.focus();
    } catch (error) {
      console.error("Could not send the chat message.", error);
      if (uploadedChatImagePath) {
        try {
          const { error: cleanupError } = await client.storage
            .from("killbyte-chat-images")
            .remove([uploadedChatImagePath]);
          if (cleanupError) console.error("Could not remove an unsent chat image.", cleanupError);
        } catch (cleanupError) {
          console.error("Could not remove an unsent chat image.", cleanupError);
        }
      }
      showStatus(`Message was not sent: ${error.message || "Check your connection and try again."}`, true);
    } finally {
      sendButton.disabled = false;
      messageInput.disabled = false;
      emojiButton.disabled = false;
      gifButton.disabled = false;
      imageButton.disabled = false;
    }
  };

  const onEmojiClick = (event) => {
    const button = event.target.closest("[data-emoji]");
    if (!button) return;
    const emoji = button.dataset.emoji;
    const start = messageInput.selectionStart;
    const end = messageInput.selectionEnd;
    if (messageInput.value.length + emoji.length - (end - start) > Number(messageInput.maxLength)) {
      showStatus("That emoji would exceed the message length limit.", true);
      return;
    }
    messageInput.setRangeText(emoji, start, end, "end");
    messageInput.focus();
  };

  const onImageSelected = () => {
    const file = imageInput.files[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      imageInput.value = "";
      showStatus("Choose a JPEG, PNG, GIF, or WebP image no larger than 5 MB.", true);
      return;
    }
    attachedImage = file;
    attachedGifUrl = "";
    attachedGifSlug = "";
    attachedGifQuery = "";
    attachmentName.textContent = `${file.name} · add a caption, then send`;
    attachmentName.hidden = false;
    messageInput.placeholder = "Add a caption (optional)...";
    hidePicker();
    messageInput.focus();
  };

  const onGifSearch = (event) => {
    event.preventDefault();
    const query = gifQuery.value.trim();
    if (query) void searchGifs(query);
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
    document.removeEventListener("keydown", onKeyDown);
    composer.removeEventListener("submit", onSendMessage);
    picker.querySelector("#chat-picker-close").removeEventListener("click", hidePicker);
    emojiButton.removeEventListener("click", onEmojiButtonClick);
    gifButton.removeEventListener("click", onGifButtonClick);
    emojiPanel.removeEventListener("click", onEmojiClick);
    imageButton.removeEventListener("click", onImageButtonClick);
    imageInput.removeEventListener("change", onImageSelected);
    gifSearchForm.removeEventListener("submit", onGifSearch);
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
  const onEmojiButtonClick = () => showPicker("emoji");
  const onGifButtonClick = () => showPicker("gif");
  const onImageButtonClick = () => imageInput.click();
  const onKeyDown = (event) => {
    if (event.key === "Escape" && !picker.hidden) hidePicker();
  };
  picker.querySelector("#chat-picker-close").addEventListener("click", hidePicker);
  emojiButton.addEventListener("click", onEmojiButtonClick);
  gifButton.addEventListener("click", onGifButtonClick);
  emojiPanel.addEventListener("click", onEmojiClick);
  imageButton.addEventListener("click", onImageButtonClick);
  imageInput.addEventListener("change", onImageSelected);
  gifSearchForm.addEventListener("submit", onGifSearch);
  document.addEventListener("keydown", onKeyDown);
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
