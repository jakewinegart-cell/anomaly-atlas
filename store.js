/* AtlasStore: Supabase REST/RPC adapter (same pattern as the recipes app). Degrades gracefully:
 * if the atlas_* RPCs are not installed yet (404 / PGRST202), `available` becomes false and the app keeps working offline. */
(function () {
  const C = window.ATLAS_CONFIG;
  class AtlasStore {
    constructor(url, key) {
      this.url = (url || "").replace(/\/$/, ""); this.key = key || "";
      this.enabled = !!(this.url && this.key); this.available = null; this.lastError = "";
      this.auth = { apikey: this.key, ...(this.key.startsWith("eyJ") ? { Authorization: "Bearer " + this.key } : {}) };
    }
    async _rpc(fn, args = {}) {
      if (!this.enabled) throw new Error("Community features are not configured.");
      let r;
      try { r = await fetch(`${this.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: { ...this.auth, "Content-Type": "application/json" }, body: JSON.stringify(args) }); }
      catch (e) { this.lastError = "network"; throw new Error("Can't reach the community server right now."); }
      const t = await r.text();
      if (!r.ok) {
        let msg = t; try { const j = JSON.parse(t); msg = j.message || j.hint || t; if (j.code === "PGRST202" || j.code === "42883") this.available = false; } catch {}
        if (r.status === 404) this.available = false;
        this.lastError = msg; const err = new Error(msg); err.status = r.status; throw err;
      }
      this.available = true;
      return t ? JSON.parse(t) : null;
    }
    async probe() { try { await this._rpc("atlas_visitors"); return true; } catch { return this.available !== false && this.lastError !== "network" ? true : false; } }
    listEvents() { return this._rpc("atlas_list_events"); }
    submitEvent(p) { return this._rpc("atlas_submit_event", { p }); }
    listLinks() { return this._rpc("atlas_list_links"); }
    submitLink(p) { return this._rpc("atlas_submit_link", { p }); }
    visit(v) { return this._rpc("atlas_visit", { p_city: v.city, p_region: v.region, p_country: v.country, p_lat: v.lat, p_lon: v.lon }); }
    visitors() { return this._rpc("atlas_visitors"); }
    adminVerify(p) { return this._rpc("atlas_admin_verify", { p_passcode: p }); }
    adminList(p) { return this._rpc("atlas_admin_list", { p_passcode: p }); }
    adminSetHidden(p, kind, id, hidden) { return this._rpc("atlas_admin_set_hidden", { p_passcode: p, p_kind: kind, p_id: id, p_hidden: hidden }); }
    async uploadPhoto(blob) {
      const path = `events/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.jpg`;
      const r = await fetch(`${this.url}/storage/v1/object/atlas-photos/${path}`, { method: "POST", headers: { ...this.auth, "Content-Type": "image/jpeg", "x-upsert": "false" }, body: blob });
      if (!r.ok) throw new Error("Photo upload failed (" + r.status + ")");
      return path;
    }
    photoUrl(path) { return `${this.url}/storage/v1/object/public/atlas-photos/${path}`; }
  }
  window.AtlasStore = new AtlasStore(C.SUPABASE_URL, C.SUPABASE_KEY);
})();
