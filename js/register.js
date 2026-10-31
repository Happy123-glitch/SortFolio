(function () {
  "use strict";
  if (sessionStorage.getItem("sf_mode")) { location.replace("index.html"); return; }

  var form = document.getElementById("regForm");
  var err = document.getElementById("regError");
  var card = document.getElementById("regCard");

  function fail(msg) {
    err.textContent = msg; err.hidden = false;
    card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    err.hidden = true;
    var name = document.getElementById("name").value.trim();
    var email = document.getElementById("email").value.trim().toLowerCase();
    var pass = document.getElementById("password").value;
    var confirm = document.getElementById("confirm").value;

    if (name.length < 2) return fail("Enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address, like you@example.com.");
    if (pass.length < 8) return fail("Use a password with at least 8 characters.");
    if (pass !== confirm) return fail("The two passwords do not match.");
    if (email === "admin@sortfolio.dev" || SFUsers.find(email)) return fail("An account with this email already exists. Sign in instead.");

    var ok = SFUsers.add({ name: name, email: email, hash: await SFUsers.hash(pass), created: Date.now() });
    if (!ok) return fail("This browser blocked saving your account. Allow site storage and try again.");

    sessionStorage.setItem("sf_mode", "user");
    sessionStorage.setItem("sf_name", name);
    document.body.classList.add("leaving");
    setTimeout(function () { location.href = "index.html"; }, 350);
  });
})();
