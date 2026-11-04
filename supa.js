/* Data layer for Closing Desk: login, rows, live sync. Talks to Supabase and nothing else.
   The page only ever calls window.CDStore. Contacts and settings are stored as one JSON document per row
   (table columns: id, owner, data, updated_at), so the contact shape can grow without database changes. */
(function () {
  "use strict";
  var cfg = window.CD_CONFIG || {};
  var sb = null, channel = null, PAGE = 1000, CHUNK = 100;

  function configured() {
    return !!(cfg.url && cfg.anonKey && /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(cfg.url) && !/YOUR-/i.test(cfg.anonKey) && window.supabase && window.supabase.createClient);
  }
  function client() {
    if (!sb) sb = window.supabase.createClient(cfg.url.replace(/\/$/, ""), cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    return sb;
  }
  function fail(error) {
    var e = new Error((error && error.message) || "Request failed");
    e.code = error && (error.code || error.status || error.name);
    throw e;
  }
  function shape(row) { return Object.assign({}, row.data || {}, { id: row.id }); }
  function plain(rec) { var o = Object.assign({}, rec); delete o.id; return o; }

  /* ---------- auth ---------- */
  function onAuth(cb) { return client().auth.onAuthStateChange(cb); }
  function getSession() {
    return client().auth.getSession().then(function (r) { return (r && r.data && r.data.session) || null; }, function () { return null; });
  }
  function signIn(email, password) {
    return client().auth.signInWithPassword({ email: email, password: password }).then(function (r) {
      if (r.error) {
        var m = String(r.error.message || "");
        var e = new Error(/failed to fetch|load failed|network|fetch/i.test(m) ? "Can't reach the server. Check your connection and try again." : /invalid login/i.test(m) ? "Wrong email or password." : (/email not confirmed/i.test(m) ? "This account is not confirmed yet. Confirm it in Supabase, then try again." : (m || "Could not sign in.")));
        e.code = r.error.code || r.error.status; throw e;
      }
      return r.data.session;
    });
  }
  function signOut() { unsubscribe(); return client().auth.signOut().then(function () {}, function () {}); }
  function userId() { return client().auth.getSession().then(function (r) { var s = r && r.data && r.data.session; return s ? s.user.id : null; }); }

  /* ---------- reads ---------- */
  function loadAll() {
    var out = [];
    function page(from) {
      return client().from("contacts").select("id,data").order("id").range(from, from + PAGE - 1).then(function (r) {
        if (r.error) fail(r.error);
        (r.data || []).forEach(function (row) { out.push(shape(row)); });
        if ((r.data || []).length >= PAGE) return page(from + PAGE);
      });
    }
    return page(0).then(function () {
      return client().from("settings").select("data").eq("id", "main").maybeSingle();
    }).then(function (r) {
      if (r.error) fail(r.error);
      return { contacts: out, settings: r.data ? r.data.data : null };
    });
  }
  function fetchOne(id) {
    return client().from("contacts").select("id,data").eq("id", id).maybeSingle().then(function (r) {
      if (r.error) fail(r.error);
      return r.data ? shape(r.data) : null;
    });
  }

  /* ---------- writes ---------- */
  /* patch merges the given fields into the stored contact on the server, so two devices editing different
     fields of the same contact do not overwrite each other. Resolves with the merged contact. */
  function patch(id, fields) {
    return client().rpc("patch_contact", { p_id: id, p_fields: fields }).then(function (r) {
      if (r.error) fail(r.error);
      if (r.data == null) fail({ message: "That contact no longer exists." });
      return Object.assign({}, r.data, { id: id });
    });
  }
  /* items: [{id, fields}]. Many contacts per request, 200 at a time. */
  function patchMany(items) {
    function next(i) {
      if (i >= items.length) return Promise.resolve();
      return client().rpc("patch_contacts", { p_items: items.slice(i, i + 200) }).then(function (r) {
        if (r.error) fail(r.error);
        return next(i + 200);
      });
    }
    return next(0);
  }
  function put(rec) {
    return userId().then(function (uid) {
      return client().from("contacts").upsert({ id: rec.id, owner: uid, data: plain(rec) }, { onConflict: "id" });
    }).then(function (r) { if (r.error) fail(r.error); });
  }
  function remove(id) {
    return client().from("contacts").delete().eq("id", id).then(function (r) { if (r.error) fail(r.error); });
  }
  function putSettings(obj) {
    return userId().then(function (uid) {
      return client().from("settings").upsert({ id: "main", owner: uid, data: obj }, { onConflict: "id" });
    }).then(function (r) { if (r.error) fail(r.error); });
  }
  function bulkPut(rows, onProgress) {
    return userId().then(function (uid) {
      var done = 0;
      function next(i) {
        if (i >= rows.length) return Promise.resolve();
        var part = rows.slice(i, i + CHUNK).map(function (rec) { return { id: rec.id, owner: uid, data: plain(rec) }; });
        return client().from("contacts").upsert(part, { onConflict: "id" }).then(function (r) {
          if (r.error) fail(r.error);
          done += part.length; if (onProgress) onProgress(done, rows.length);
          return next(i + CHUNK);
        });
      }
      return next(0);
    });
  }

  /* ---------- live sync ---------- */
  function unsubscribe() { if (channel && sb) { try { sb.removeChannel(channel); } catch (e) {} } channel = null; }
  function subscribe(h) {
    unsubscribe();
    channel = client().channel("closing-desk")
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, function (p) {
        if (p.eventType === "DELETE") { if (p.old && p.old.id) h.contact("delete", p.old.id, null); }
        else if (p.new && p.new.data) h.contact("upsert", p.new.id, shape(p.new));
        else if (p.new && p.new.id) h.contact("refetch", p.new.id, null);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, function (p) {
        if (p.new && p.new.data) h.settings(p.new.data);
      })
      .subscribe(function (status) { if (h.status) h.status(status); });
  }

  /* ---------- Tell Claude (v1.6): inbox, tasks and requests tables, same row shape as contacts ---------- */
  function listDocs(table, limit) {
    return client().from(table).select("id,data,updated_at").order("updated_at", { ascending: false }).limit(limit || 200).then(function (r) {
      if (r.error) fail(r.error);
      return (r.data || []).map(shape);
    });
  }
  function putDoc(table, rec) {
    return userId().then(function (uid) {
      return client().from(table).upsert({ id: rec.id, owner: uid, data: plain(rec) }, { onConflict: "id" });
    }).then(function (r) { if (r.error) fail(r.error); });
  }
  /* Calls a Supabase Edge Function as the signed-in user. Resolves with its JSON; a failure carries .status and .code. */
  function invoke(name, body) {
    return client().functions.invoke(name, { body: body }).then(function (r) {
      if (!r.error) return r.data;
      var ctx = r.error.context, e = new Error(r.error.message || "Request failed");
      e.status = ctx && ctx.status;
      return (ctx && ctx.json ? ctx.json().catch(function () { return {}; }) : Promise.resolve({})).then(function (j) { if (j && j.error) e.code = j.error; throw e; });
    });
  }

  window.CDStore = {
    configured: configured, onAuth: onAuth, getSession: getSession, signIn: signIn, signOut: signOut,
    loadAll: loadAll, fetchOne: fetchOne, patch: patch, patchMany: patchMany, put: put, remove: remove, putSettings: putSettings, bulkPut: bulkPut,
    subscribe: subscribe, unsubscribe: unsubscribe, listDocs: listDocs, putDoc: putDoc, invoke: invoke
  };
})();
