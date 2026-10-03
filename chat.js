(() => {
  window.killbyteChatCleanup?.();

  const status = document.getElementById("chat-status");
  const setup = document.getElementById("chat-setup");
  const authPanel = document.getElementById("chat-auth");
  const chatPanel = document.getElementById("chat-panel");
  const authForm = document.getElementById("chat-auth-form");
  const nameField = document.getElementById("chat-name-field");
  const nameInput = document.getElementById("chat-display-name");
  const emailInput = document.getElementById("chat-email");
  const passwordInput = document.getElementById("chat-password");
  const authSubmit = document.getElementById("chat-auth-submit");
  const signInTab = document.getElementById("chat-signin-tab");
  const signUpTab = document.getElementById("chat-signup-tab");
  const currentUser = document.getElementById("chat-current-user");
  const signOutButton = document.getElementById("chat-signout");
  const messagesList = document.getElementById("chat-messages");
  const composer = document.getElementById("chat-composer");
  const messageInput = document.getElementById("chat-message-input");

  if (!status || !setup || !authPanel || !chatPanel) return;

  let mode = "signin";
  let channel = null;
  let authSubscription = null;
  let activeUserId = null;
  let messages = new Map();
  let disposed = false;

  const showStatus = (message, isError = false) => {
    status.textContent = message;
    status.dataset.error = String(isError);
  };

  const getDisplayName = (user) => {
    const metadataName = user.user_metadata?.display_name;
    const fallbackName = user.email?.split("@")[0] || "Member";
    const name = typeof metadataName === "string" && metadataName.trim() ? metadataName.trim() : fallbackName;
    return Array.from(name).slice(0, 32).join("");
  };

  const setMode = (nextMode) => {
    mode = nextMode;
    const signingUp = mode === "signup";
    nameField.hidden = !signingUp;
    nameInput.required = signingUp;
    passwordInput.autocomplete = signingUp ? "new-password" : "current-password";
    authSubmit.textContent = signingUp ? "Create account" : "Sign in";
    signInTab.setAttribute("aria-selected", String(!signingUp));
    signUpTab.setAttribute("aria-selected", String(signingUp));
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
      const author = document.createElement("strong");
      author.textContent = message.username;
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
      renderMessages();
    }

    currentUser.textContent = getDisplayName(user);
    chatPanel.hidden = false;
    authPanel.hidden = true;
    setup.hidden = true;

    if (channel) return;
    const currentChannel = client
      .channel("killbyte-general-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        ({ new: message }) => {
          if (disposed || !message?.id) return;
          messages.set(message.id, message);
          renderMessages();
        }
      )
      .subscribe((subscriptionStatus) => {
        if (disposed) return;
        if (subscriptionStatus === "CHANNEL_ERROR" || subscriptionStatus === "TIMED_OUT") {
          showStatus("Live updates could not connect. Check Supabase Realtime setup and your connection.", true);
        } else if (subscriptionStatus === "SUBSCRIBED") {
          showStatus("Connected to #general.");
        }
      });
    channel = currentChannel;

    const { data, error } = await client
      .from("chat_messages")
      .select("id, user_id, username, content, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (disposed || activeUserId !== user.id) return;
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
    setMode("signin");
  };

  const onAuthSubmit = async (event) => {
    event.preventDefault();
    authSubmit.disabled = true;

    try {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      let result;

      if (mode === "signup") {
        const displayName = nameInput.value.trim();
        if (displayName.length < 2) {
          showStatus("Display names must be at least 2 characters.", true);
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
        showStatus(result.error.message, true);
      } else if (mode === "signup" && !result.data.session) {
        showStatus("Account created. Check your email to confirm it, then sign in.");
        setMode("signin");
        passwordInput.value = "";
      } else {
        showStatus(mode === "signup" ? "Account created. Welcome to #general!" : "Signed in.");
        authForm.reset();
      }
    } catch (error) {
      console.error("Could not complete the account request.", error);
      showStatus("The account request failed. Check your connection and try again.", true);
    } finally {
      authSubmit.disabled = false;
    }
  };

  const onSignOut = async () => {
    signOutButton.disabled = true;
    try {
      const { error } = await client.auth.signOut();
      if (error) {
        showStatus(`Could not sign out: ${error.message}`, true);
        return;
      }
      showStatus("You are signed out.");
    } catch (error) {
      console.error("Could not sign out.", error);
      showStatus("Could not sign out. Check your connection and try again.", true);
    } finally {
      signOutButton.disabled = false;
    }
  };

  const onSendMessage = async (event) => {
    event.preventDefault();
    const content = messageInput.value.trim();
    if (!content || !activeUserId) return;

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
        .insert({ user_id: userResult.user.id, username, content })
        .select("id, user_id, username, content, created_at")
        .single();

      if (error) {
        showStatus(`Message was not sent: ${error.message}`, true);
        return;
      }

      messages.set(data.id, data);
      renderMessages();
      messageInput.value = "";
      showStatus("Message sent.");
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
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("killbyte:beforeNavigate", onBeforeNavigate);
    authForm.removeEventListener("submit", onAuthSubmit);
    signOutButton.removeEventListener("click", onSignOut);
    composer.removeEventListener("submit", onSendMessage);
    if (authSubscription) authSubscription.unsubscribe();
    void stopRealtime();
    if (window.killbyteChatCleanup === cleanup) delete window.killbyteChatCleanup;
  };

  window.killbyteChatCleanup = cleanup;
  window.addEventListener("killbyte:beforeNavigate", onBeforeNavigate);
  signInTab.addEventListener("click", () => setMode("signin"));
  signUpTab.addEventListener("click", () => setMode("signup"));
  authForm.addEventListener("submit", onAuthSubmit);
  signOutButton.addEventListener("click", onSignOut);
  composer.addEventListener("submit", onSendMessage);
  setMode("signin");

  const supabaseUrl = window.KILLBYTE_SUPABASE_URL;
  const supabaseAnonKey = window.KILLBYTE_SUPABASE_ANON_KEY;
  const hasConfiguration =
    typeof supabaseUrl === "string" &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl) &&
    typeof supabaseAnonKey === "string" &&
    supabaseAnonKey.length > 20 &&
    supabaseAnonKey !== "YOUR_SUPABASE_ANON_KEY";

  if (!hasConfiguration) {
    setup.hidden = false;
    showStatus("Chat is not connected yet. Finish the Supabase setup to enable it.", true);
    return;
  }

  if (!window.supabase?.createClient) {
    showStatus("The chat client could not load. Refresh the page or check your connection.", true);
    return;
  }

  const client = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

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
      showStatus("Sign in to join #general.");
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
      showStatus("Sign in to join #general.");
      return;
    }
    void handleAuthChange(data.session);
  }).catch((error) => {
    console.error("Could not check the chat account session.", error);
    showStatus("Could not check your account. Check your connection and refresh the page.", true);
  });
})();
