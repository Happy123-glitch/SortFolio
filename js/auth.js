/* Login logic. DEMO ONLY: checks run in the browser and are not secure.
   For production, replace with Supabase Auth (signInWithPassword) and RLS. */
(function () {
  "use strict";
  var ADMIN = { email: "admin@sortfolio.dev", password: "sortfolio@123" };
  var form = document.getElementById("loginForm");
  var err = document.getElementById("loginError");
  var card = document.getElementById("loginCard");

  if (sessionStorage.getItem("sf_mode")) { location.replace("index.html"); return; }

  function go(mode, name) {
    sessionStorage.setItem("sf_mode", mode);
    sessionStorage.setItem("sf_name", name || "");
    document.body.classList.add("leaving");
    setTimeout(function () { location.href = "index.html"; }, 350);
  }
  function fail() {
    err.textContent = "Email or password is incorrect. Check both, or create an account.";
    err.hidden = false;
    card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var email = document.getElementById("email").value.trim().toLowerCase();
    var pass = document.getElementById("password").value;
    if (email === ADMIN.email && pass === ADMIN.password) { go("admin", "Admin"); return; }
    var user = SFUsers.find(email);
    if (user && user.hash === await SFUsers.hash(pass)) { go("user", user.name); return; }
    fail();
  });

  document.getElementById("demoBtn").addEventListener("click", function () { go("demo", "Demo"); });
})();
