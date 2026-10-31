/* Supabase sign-in and anonymous demo access. */
(function () {
  "use strict";
  var form = document.getElementById("loginForm");
  var err = document.getElementById("loginError");
  var card = document.getElementById("loginCard");
  var emailInput = document.getElementById("email");
  var passwordInput = document.getElementById("password");
  var submitButton = form.querySelector('button[type="submit"]');

  function fail(message) {
    err.textContent = message;
    err.hidden = false;
    card.classList.remove("shake");
    void card.offsetWidth;
    card.classList.add("shake");
  }

  function enterApp(session, fallbackMode) {
    var user = session && session.user;
    var mode = fallbackMode || (user && user.is_anonymous ? "demo" : "user");
    var metadata = user && user.user_metadata || {};
    sessionStorage.setItem("sf_mode", mode);
    sessionStorage.setItem("sf_name", metadata.full_name || (mode === "demo" ? "Demo" : ""));
    if (user && user.email) sessionStorage.setItem("sf_email", user.email);
    else sessionStorage.removeItem("sf_email");
    document.body.classList.add("leaving");
    setTimeout(function () { location.href = "index.html"; }, 350);
  }

  async function restoreSession() {
    var logoutError = sessionStorage.getItem("sf_logout_error");
    if (logoutError) {
      sessionStorage.removeItem("sf_logout_error");
      fail("Signed out locally, but Supabase reported: " + logoutError);
      return;
    }
    if (!window.SFBackend.isConfigured()) {
      if (sessionStorage.getItem("sf_mode")) location.replace("index.html");
      return;
    }
    if (!window.SFBackend.isReady()) {
      fail("The Supabase client could not load. Check your internet connection and reload.");
      return;
    }
    try {
      var session = await window.SFBackend.getSession();
      if (session) enterApp(session);
      else {
        sessionStorage.removeItem("sf_mode");
        sessionStorage.removeItem("sf_name");
        sessionStorage.removeItem("sf_email");
      }
    } catch (error) {
      fail(error.message || "Could not restore your sign-in session.");
    }
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    err.hidden = true;
    if (!window.SFBackend.isReady()) {
      fail("Sign-in needs Supabase configured. Set the project URL and public anon key in js/supabase-config.js.");
      return;
    }
    submitButton.disabled = true;
    try {
      var result = await window.SFBackend.signIn(emailInput.value.trim().toLowerCase(), passwordInput.value);
      enterApp(result.session);
    } catch (error) {
      fail(error.message || "Could not sign in. Check your email and password.");
    } finally {
      submitButton.disabled = false;
    }
  });

  document.getElementById("demoBtn").addEventListener("click", async function (event) {
    var button = event.currentTarget;
    err.hidden = true;
    button.disabled = true;
    try {
      if (!window.SFBackend.isConfigured()) {
        enterApp(null, "demo");
        return;
      }
      if (!window.SFBackend.isReady()) throw new Error("The Supabase client could not load. Check your internet connection and reload.");
      var result = await window.SFBackend.signInAnonymously();
      enterApp(result.session, "demo");
    } catch (error) {
      fail(error.message || "Could not start the demo.");
    } finally {
      button.disabled = false;
    }
  });

  var emailFromLink = new URLSearchParams(location.search).get("email");
  if (emailFromLink) emailInput.value = emailFromLink;
  restoreSession();
})();
