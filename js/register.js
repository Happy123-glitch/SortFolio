/* Supabase account registration. */
(function () {
  "use strict";
  var form = document.getElementById("regForm");
  var err = document.getElementById("regError");
  var card = document.getElementById("regCard");
  var submitButton = form.querySelector('button[type="submit"]');

  function fail(message) {
    err.textContent = message;
    err.hidden = false;
    card.classList.remove("shake");
    void card.offsetWidth;
    card.classList.add("shake");
  }

  function enterApp(session, name) {
    sessionStorage.setItem("sf_mode", "user");
    sessionStorage.setItem("sf_name", name);
    if (session.user.email) sessionStorage.setItem("sf_email", session.user.email);
    document.body.classList.add("leaving");
    setTimeout(function () { location.href = "index.html"; }, 350);
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    err.hidden = true;
    var name = document.getElementById("name").value.trim();
    var email = document.getElementById("email").value.trim().toLowerCase();
    var password = document.getElementById("password").value;
    var confirm = document.getElementById("confirm").value;

    if (name.length < 2) return fail("Enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address, like you@example.com.");
    if (password.length < 8) return fail("Use a password with at least 8 characters.");
    if (password !== confirm) return fail("The two passwords do not match.");
    if (!window.SFBackend.isReady()) {
      return fail("Registration needs Supabase configured. Set the project URL and public anon key in js/supabase-config.js.");
    }

    submitButton.disabled = true;
    try {
      var result = await window.SFBackend.signUp(name, email, password);
      if (result.session) {
        enterApp(result.session, name);
        return;
      }
      err.textContent = "Account created. Verify your email, then sign in.";
      err.hidden = false;
      document.getElementById("email").value = email;
      document.getElementById("password").value = "";
      document.getElementById("confirm").value = "";
    } catch (error) {
      fail(error.message || "Could not create your account.");
    } finally {
      submitButton.disabled = false;
    }
  });
})();
