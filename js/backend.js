/* Supabase Auth and account-profile access for the browser client. */
(function () {
  "use strict";

  var url = window.SF_SUPABASE_URL || localStorage.getItem("sf_supabase_url") || "";
  var key = window.SF_SUPABASE_KEY || localStorage.getItem("sf_supabase_key") || "";
  var client = null;

  function getClient() {
    if (!url || !key) throw new Error("Supabase is not configured. Set SF_SUPABASE_URL and SF_SUPABASE_KEY in js/supabase-config.js.");
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("The Supabase client could not load. Check your internet connection and reload.");
    }
    if (!client) {
      client = window.supabase.createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    }
    return client;
  }

  async function getUser() {
    var result = await getClient().auth.getUser();
    if (result.error) throw result.error;
    if (!result.data.user) throw new Error("Your session has expired. Sign in again.");
    return result.data.user;
  }

  async function getProfile() {
    var user = await getUser();
    var db = getClient();
    var result = await db.from("profiles")
      .select("id, full_name, contact_email, created_at")
      .eq("id", user.id)
      .maybeSingle();
    if (result.error) throw result.error;
    if (result.data) return result.data;

    var created = await db.from("profiles").insert({
      id: user.id,
      full_name: user.user_metadata && user.user_metadata.full_name || "",
      contact_email: user.email || ""
    }).select("id, full_name, contact_email, created_at").single();
    if (created.error) throw created.error;
    return created.data;
  }

  async function saveProfile(profile) {
    var user = await getUser();
    var result = await getClient().from("profiles").upsert({
      id: user.id,
      full_name: profile.full_name,
      contact_email: profile.contact_email,
      updated_at: new Date().toISOString()
    }, { onConflict: "id" }).select("id, full_name, contact_email, created_at").single();
    if (result.error) throw result.error;
    return result.data;
  }

  window.SFBackend = {
    isConfigured: function () { return !!(url && key); },
    isReady: function () {
      return !!(url && key && window.supabase && typeof window.supabase.createClient === "function");
    },
    getSession: async function () {
      var result = await getClient().auth.getSession();
      if (result.error) throw result.error;
      return result.data.session;
    },
    getCurrentUser: getUser,
    getProfile: getProfile,
    saveProfile: saveProfile,
    signIn: async function (email, password) {
      var result = await getClient().auth.signInWithPassword({ email: email, password: password });
      if (result.error) throw result.error;
      return result.data;
    },
    signUp: async function (name, email, password) {
      var result = await getClient().auth.signUp({
        email: email,
        password: password,
        options: { data: { full_name: name } }
      });
      if (result.error) throw result.error;
      return result.data;
    },
    signInAnonymously: async function () {
      var result = await getClient().auth.signInAnonymously({ options: { data: { full_name: "Demo" } } });
      if (result.error) throw result.error;
      return result.data;
    },
    verifyPassword: async function (password) {
      var user = await getUser();
      var result = await getClient().auth.signInWithPassword({ email: user.email, password: password });
      if (result.error) throw result.error;
      return result.data.user;
    },
    updateAccount: async function (changes) {
      var result = await getClient().auth.updateUser(changes);
      if (result.error) throw result.error;
      return result.data.user;
    },
    signOut: async function () {
      var result = await getClient().auth.signOut({ scope: "local" });
      if (result.error) throw result.error;
    }
  };
})();
