/* Local user store. DEMO ONLY: accounts live in this browser's localStorage.
   For production, replace with Supabase Auth (signUp / signInWithPassword). */
window.SFUsers = (function () {
  var KEY = "sf_users";
  function all() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  async function hash(text) {
    if (window.crypto && crypto.subtle) {
      var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    }
    return btoa(unescape(encodeURIComponent(text)));
  }
  function find(email) {
    return all().filter(function (u) { return u.email === email; })[0] || null;
  }
  function add(user) {
    var list = all(); list.push(user);
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
  }
  return { hash: hash, find: find, add: add };
})();
