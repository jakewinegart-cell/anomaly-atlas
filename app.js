/* Anomaly Atlas — main app (no build step). MapLibre GL JS v5 globe + clustered GeoJSON + lazy detail chunks. */
(function () {
"use strict";
const C = window.ATLAS_CONFIG, S = window.AtlasStore, V = "?v=" + C.VERSION;
const TYPES = [
  { id: "ufo", label: "UFO / UAP sighting", color: "#00e5ff", shape: "circle" },
  { id: "bluebook", label: "Project Blue Book case", color: "#5468ff", shape: "square" },
  { id: "cryptid", label: "Cryptid / Bigfoot sighting", color: "#2bff6b", shape: "triangle" },
  { id: "sound", label: "Unexplained sound", color: "#ff8c00", shape: "diamond" },
  { id: "phenomenon", label: "Strange phenomenon", color: "#ff2bd6", shape: "star" },
  { id: "disappearance", label: "Disappearance (unexplained)", color: "#ff1f3d", shape: "hexagon" },
  { id: "mass", label: "Mass event: motive unexplained", color: "#f2f2f2", shape: "target", sub: "Documented tragedies · off by default" },
  { id: "other", label: "High strangeness / other", color: "#ffe500", shape: "cross" }];
const COMMUNITY_COLOR = "#ffffff";
/* ---- marker shapes: one geometry used by both the map icons (canvas) and the UI chips (SVG) ---- */
function shapePts(shape) {   // polygon vertices in a unit box centred on 0,0 (radius ~1)
  const poly = (n, rot, r = 1) => Array.from({ length: n }, (_, i) => { const a = rot + i * 2 * Math.PI / n; return [r * Math.cos(a), r * Math.sin(a)]; });
  switch (shape) {
    case "square": return [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]];
    case "triangle": return [[0, -1.05], [0.98, 0.72], [-0.98, 0.72]];
    case "diamond": return [[0, -1.08], [0.85, 0], [0, 1.08], [-0.85, 0]];
    case "star": return Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.48 : 1.1; return [r * Math.cos(a), r * Math.sin(a)]; });
    case "hexagon": return poly(6, Math.PI / 6, 0.98);
    case "cross": { const a = 0.36, b = 1.0; return [[-a, -b], [a, -b], [a, -a], [b, -a], [b, a], [a, a], [a, b], [-a, b], [-a, a], [-b, a], [-b, -a], [-a, -a]]; }
    default: return null;   // circle / target
  }
}
function shapeSVG(t, size = 14, dashed = false) {
  const pts = t && shapePts(t.shape), col = t ? t.color : COMMUNITY_COLOR, sw = 0.22;
  const style = `fill="${dashed ? "none" : col}" stroke="${dashed ? "#fff" : "#0a0c18"}" stroke-width="${dashed ? 0.3 : sw}"${dashed ? ' stroke-dasharray="0.5 0.35"' : ""}`;
  const body = pts ? `<polygon points="${pts.map(p => p.map(v => v.toFixed(2)).join(",")).join(" ")}" ${style}/>`
    : `<circle r="${dashed ? 0.85 : 0.95}" ${style}/>` + (t && t.shape === "target" ? `<circle r="0.32" fill="#0a0c18"/>` : "");
  return `<svg class="shp" width="${size}" height="${size}" viewBox="-1.25 -1.25 2.5 2.5" aria-hidden="true">${body}</svg>`;
}
function shapeIcon(t, curated) {   // canvas icon at 2x: soft glow, thin dark outline, white halo ring for curated cases
  const S2 = curated ? 60 : 44, R = curated ? 15 : 12, c = document.createElement("canvas"); c.width = c.height = S2;
  const g = c.getContext("2d"); g.translate(S2 / 2, S2 / 2);
  const path = () => { g.beginPath(); const pts = shapePts(t.shape); if (!pts) g.arc(0, 0, R * 0.95, 0, 7); else { pts.forEach(([x, y], i) => i ? g.lineTo(x * R, y * R) : g.moveTo(x * R, y * R)); g.closePath(); } };
  g.shadowColor = t.color; g.shadowBlur = 9; path(); g.fillStyle = t.color; g.fill();   // glow
  g.shadowColor = "rgba(0,0,0,0.55)"; g.shadowBlur = 3; path(); g.fill(); g.shadowBlur = 0;
  g.lineJoin = "round"; g.lineWidth = 2.6; g.strokeStyle = "#0a0c18"; path(); g.stroke();
  if (t.shape === "target") { g.fillStyle = "#0a0c18"; g.beginPath(); g.arc(0, 0, R * 0.34, 0, 7); g.fill(); }
  if (curated) { g.lineWidth = 2.4; g.strokeStyle = "#ffffff"; g.beginPath(); g.arc(0, 0, R + 7, 0, 7); g.stroke(); g.lineWidth = 1.2; g.strokeStyle = "#0a0c18"; g.beginPath(); g.arc(0, 0, R + 8.8, 0, 7); g.stroke(); }
  return { width: S2, height: S2, data: g.getImageData(0, 0, S2, S2).data };
}
const TI = Object.fromEntries(TYPES.map((t, i) => [t.id, i]));
const SPEC_OK = new Set(["ufo", "bluebook", "cryptid", "sound", "phenomenon"]);
const NO_SPEC = new Set(["mass", "disappearance"]);
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isPhone = () => matchMedia("(max-width:820px)").matches;
const fmtN = n => n.toLocaleString("en-US");

const st = {
  manifest: null, pts: {}, loading: {}, grid: new Map(), community: [], communityFiltered: [], theories: [], waves: [], links: [], ctx: null,
  enabled: new Set(TYPES.filter(t => t.id !== "mass").map(t => t.id)), community_on: true,
  cred: [0, 100], uq: [0, 100], years: [1000, 2026], undated: true, q: "",
  outcomes: new Set(["a", "d", "n", "u"]), m411: false,
  connections: false, autoconnect: true, days: 7, km: 150, style: "realistic", ctxOn: new Set(), visitorsOn: false,
  selected: null, arcs: [], detailCache: {}, mode: null, linkA: null, visitors: null, admin: null, filtered: []
};
window.Atlas = { st, ready: false, errors: [] };

/* ------------------------------------------------------------ helpers */
function toast(msg, ms = 3200) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, ms); }
function dToOrd(d) { if (!d) return null; const y = Math.floor(d / 10000), m = Math.floor(d / 100) % 100, dd = d % 100; return Math.floor(Date.UTC(y, m - 1, dd || 1) / 864e5); }
function fmtDate(s) { if (!s) return "Date unknown"; const [y, m, d] = String(s).split("-"); if (!m) return y; const mo = new Date(Date.UTC(+y, +m - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" }); return d ? `${mo} ${+d}, ${y}` : `${mo} ${y}`; }
function hav(a, b, c, d) { const p = Math.PI / 180, x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); }
async function getJSON(u) { const r = await fetch(u); if (!r.ok) throw new Error(u + " " + r.status); return r.json(); }
/* ---- Back-button support: every user-opened panel pushes a history entry; Back closes the topmost one.
   UI closes (X, swipe, backdrop, Esc) close immediately and then pop their own entry silently. ---- */
const NAV = { stack: [], silent: 0, queue: [] };
function navRun(fn) { if (NAV.silent > 0) NAV.queue.push(fn); else fn(); }
function navPush(key, hash, close, opts = {}) {
  navRun(() => {
    const top = NAV.stack[NAV.stack.length - 1];
    const replace = top && (top.key === key || (opts.replaceKeys || []).includes(top.key));
    if (replace) { NAV.stack[NAV.stack.length - 1] = { key, close, data: opts.data }; history.replaceState({ atlas: NAV.stack.length }, "", hash); }
    else { NAV.stack.push({ key, close, data: opts.data }); history.pushState({ atlas: NAV.stack.length }, "", hash); }
  });
}
function navDrop(keys) {   // the panel was already closed by the UI: pop its own entries without closing anything again
  keys = [].concat(keys); let k = 0;
  while (NAV.stack.length && keys.includes(NAV.stack[NAV.stack.length - 1].key)) { NAV.stack.pop(); k++; }
  if (k) { NAV.silent += k; history.go(-k); }
}
function navTop() { return NAV.stack[NAV.stack.length - 1]; }
window.addEventListener("popstate", () => {
  if (NAV.silent > 0) { NAV.silent--; if (!NAV.silent) { const q = NAV.queue.splice(0); q.forEach(f => f()); } return; }
  const top = NAV.stack.pop(); if (top) { try { top.close(); } catch (e) { console.warn(e); } }   // camera is left where it is
});
const DETAIL_KEYS = ["event", "list"];
function shareURL(id) { return location.origin + location.pathname + location.search + "#event=" + encodeURIComponent(id); }
function openSheet(id, state) {
  const el = $("#" + id); el.dataset.state = state || (isPhone() ? "half" : "open");
  if (id === "filters") document.body.classList.add("filters-open");
  if (isPhone()) { const other = id === "filters" ? "detail" : "filters"; $("#" + other).dataset.state = "closed"; }
}
function closeSheetRaw(id) { $("#" + id).dataset.state = "closed"; if (id === "filters") document.body.classList.remove("filters-open"); if (id === "detail") { clearSelection(); unspiderfy && map && unspiderfy(); } }
function closeSheet(id) { closeSheetRaw(id); navDrop(id === "detail" ? DETAIL_KEYS : [id]); }
function openFilters() {
  openSheet("filters");
  // on phones the two sheets are exclusive, so the filters entry replaces a detail entry rather than stacking on it
  navPush("filters", "#filters", () => closeSheetRaw("filters"), { replaceKeys: isPhone() ? DETAIL_KEYS : [] });
}

/* ------------------------------------------------------------ map */
let map;
function baseURL() { return location.origin + location.pathname.replace(/[^/]*$/, ""); }
function bmSource() {
  return { type: "raster", tiles: [baseURL() + C.BLUE_MARBLE.tiles + V], tileSize: 256, minzoom: 0, maxzoom: C.BLUE_MARBLE.maxzoom, attribution: C.BLUE_MARBLE.attribution };
}
const lowZoom = (lo, hi, z = 7) => ["step", ["zoom"], lo, z, hi];
async function realisticStyle(s) {
  let vs = null;
  try { const r = await fetch(s.vector); if (r.ok) vs = await r.json(); } catch (e) {}
  const bm = { id: "bluemarble", type: "raster", source: "bm", paint: { "raster-opacity": ["interpolate", ["linear"], ["zoom"], 5.5, 1, 8, 0], "raster-fade-duration": 200, "raster-saturation": 0.05 } };
  if (!vs) return { version: 8, glyphs: C.GLYPHS, sources: { bm: bmSource() }, layers: [{ id: "bg", type: "background", paint: { "background-color": "#0b2a4a" } }, Object.assign(bm, { paint: {} })] };
  // drop the hosted shaded-relief raster: imagery comes only from our local tiles
  for (const [k, src] of Object.entries(vs.sources)) if (src.type === "raster") { delete vs.sources[k]; vs.layers = vs.layers.filter(l => l.source !== k); }
  vs.sources.bm = bmSource();
  let at = vs.layers.findIndex(l => l.id === "aeroway_fill"); if (at < 0) at = vs.layers.findIndex(l => l.type === "line" && /road|tunnel|bridge/.test(l.id));
  vs.layers.splice(at < 0 ? 1 : at, 0, bm);   // above land/water fills, below roads, borders and labels
  for (const l of vs.layers) {
    l.paint = l.paint || {};
    if (/^boundary/.test(l.id) && typeof l.paint["line-color"] !== "object") {
      l.paint["line-color"] = lowZoom("rgba(255,255,255,0.62)", l.paint["line-color"] || "#9e9cab");
      l.minzoom = Math.min(l.minzoom || 0, l.id === "boundary_2" ? 0 : 3);
    }
    if (l.type === "symbol" && /^label_(country|state|city|town)|^water_name/.test(l.id)) {
      const water = /^water/.test(l.id);
      l.paint["text-color"] = lowZoom(water ? "#bfe3ff" : "#ffffff", typeof l.paint["text-color"] === "string" ? l.paint["text-color"] : "#333");
      l.paint["text-halo-color"] = lowZoom("rgba(5,10,25,0.85)", "rgba(255,255,255,0.9)");
      l.paint["text-halo-width"] = 1.4;
    }
  }
  return vs;
}
const DUP_PLACE = /^(label|place)_(city|city_capital|city_large|town|village)$/;
function stripPlaceLabels(vs) { vs.layers = vs.layers.filter(l => !(l.type === "symbol" && DUP_PLACE.test(l.id))); return vs; }
async function styleFor(key) {
  const s = C.STYLES[key] || C.STYLES.realistic;
  if (s.vector) return stripPlaceLabels(await realisticStyle(s));
  if (s.url) { try { const r = await fetch(s.url); if (r.ok) return stripPlaceLabels(await r.json()); } catch (e) {} return s.url; }
  return { version: 8, glyphs: C.GLYPHS, sources: { sat: { type: "raster", tiles: [s.raster], tileSize: 256, maxzoom: s.maxzoom, attribution: s.attribution } },
    layers: [{ id: "bg", type: "background", paint: { "background-color": "#05060f" } }, { id: "sat", type: "raster", source: "sat" }] };
}
async function initMap(stylePromise) {
  map = new maplibregl.Map({ container: "map", style: await (stylePromise || styleFor(st.style)), center: [-98, 34], zoom: isPhone() ? 1.25 : 1.8, minZoom: 0.6, maxZoom: 19,
    attributionControl: { compact: true }, renderWorldCopies: false, maxPitch: 70 });
  window.Atlas.map = map;
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: false }, trackUserLocation: false }), "bottom-right");
  map.on("style.load", () => { try { map.setProjection({ type: "globe" }); } catch (e) {} setupSky(); addLayers(); refreshAll(); });
  map.on("error", e => { const m = (e && e.error && e.error.message) || ""; if (!/Failed to fetch|NetworkError|AbortError/i.test(m)) console.warn("map error", m); });
  map.on("render", updateDonuts);
  map.on("moveend", loadCityCells);
  wireMapEvents();
}
function setupSky() {
  const real = st.style !== "dark";
  try { map.setSky({ "sky-color": "#0b0f2e", "horizon-color": real ? "#4f9dff" : "#2a2470", "fog-color": "#0b0f2e", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.9,
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0] }); } catch (e) {}
}
/* ---- city labels: GeoNames cities500 (CC BY 4.0), tiered by population so smaller places need a closer zoom ---- */
const CITY_TIERS = [[5e6, 1e12, 1, 13.5, true], [1e6, 5e6, 3, 12.5, true], [2.5e5, 1e6, 5, 12, false], [5e4, 2.5e5, 7, 11.5, false], [1e4, 5e4, 9, 11.5, false], [0, 1e4, 10.5, 11, false]];
const CITY_CELL_ZOOM = 8.5;
function addCities(c) {
  const out = st.cityFeats || (st.cityFeats = []);
  for (let i = 0; i < c.n.length; i++) out.push({ type: "Feature", geometry: { type: "Point", coordinates: [c.x[i], c.y[i]] }, properties: { n: c.n[i], p: c.p[i] } });
  if (map && map.getSource("cities")) map.getSource("cities").setData({ type: "FeatureCollection", features: out });
}
async function loadCities() {
  try {
    const [idx, base] = await Promise.all([getJSON(`data/cities/index.json${V}`), getJSON(`data/cities/base.json${V}`)]);
    st.cityIdx = idx; st.cityCells = new Set(idx.cells); st.cityLoaded = new Set(); addCities(base); loadCityCells();
  } catch (e) { console.warn("city labels unavailable", e); }
}
async function loadCityCells() {
  if (!st.cityIdx || !map || map.getZoom() < CITY_CELL_ZOOM) return;
  const b = map.getBounds(), cs = st.cityIdx.cell, want = [];
  const x0 = Math.floor((Math.max(-180, b.getWest()) + 180) / cs), x1 = Math.floor((Math.min(179.999, b.getEast()) + 180) / cs);
  const y0 = Math.floor((Math.max(-90, b.getSouth()) + 90) / cs), y1 = Math.floor((Math.min(89.999, b.getNorth()) + 90) / cs);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + "_" + y; if (st.cityCells.has(k) && !st.cityLoaded.has(k)) want.push(k); }
  if (want.length > 9) return;   // safety: never pull a whole continent at once
  want.forEach(k => st.cityLoaded.add(k));
  const got = await Promise.all(want.map(k => getJSON(`data/cities/c/${k}.json${V}`).catch(() => null)));
  for (const c of got) if (c) addCities(c);
}
/* ---- stacks: events at the same (or nearly the same) spot, e.g. city-centre geocodes ---- */
const STACK_M = 110, STACK_CELL = 0.001;
const PREC = { c: "Location approximate (city center)", s: "Location approximate (state level)", n: "Location approximate (country level)",
  p: "Location approximate (park centroid)", a: "Location approximate (area or trailhead, not an exact last-seen point)" };
function precNote(q) { return PREC[q] || ""; }
function groupStacks(feats) {
  const buckets = new Map();
  for (const f of feats) {
    const [x, y] = f.geometry.coordinates, bx = Math.round(x / STACK_CELL), by = Math.round(y / STACK_CELL), k = bx + ":" + by;
    let b = buckets.get(k); if (!b) buckets.set(k, b = { bx, by, x, y, m: [] }); b.m.push(f);
  }
  const order = [...buckets.values()].sort((a, b) => b.m.length - a.m.length), out = [], stacks = new Map();
  for (const b of order) {
    if (b.done) continue; b.done = true; let members = b.m;
    const kx = 111320 * Math.cos(b.y * Math.PI / 180);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue; const n = buckets.get((b.bx + dx) + ":" + (b.by + dy));
      if (!n || n.done) continue;
      if (Math.hypot((n.x - b.x) * kx, (n.y - b.y) * 110540) <= STACK_M) { n.done = true; members = members.concat(n.m); }
    }
    if (members.length === 1) { out.push(members[0]); continue; }
    const id = "stk:" + stacks.size, props = { i: id, g: members.length, c: 0 }, cnt = TYPES.map(() => 0);
    for (const f of members) { cnt[f.properties.t]++; if (f.properties.c) props.c = 1; }
    cnt.forEach((v, i) => props["g" + i] = v); props.t = cnt.indexOf(Math.max(...cnt));
    members.sort((a, b) => (b.properties.c || 0) - (a.properties.c || 0) || b.properties.s - a.properties.s || (b.properties.d || 0) - (a.properties.d || 0));
    stacks.set(id, { id, members, coords: [b.x, b.y] });
    out.push({ type: "Feature", geometry: { type: "Point", coordinates: [b.x, b.y] }, properties: props });
  }
  st.stacks = stacks; return out;
}
function stackEl(p) {
  const counts = TYPES.map((t, i) => p["g" + i] || 0);
  const el = donutEl({ point_count: p.g, point_count_abbreviated: abbr(p.g), ...Object.fromEntries(counts.map((v, i) => ["c" + i, v])) }, true);
  el.classList.add("stack"); el.dataset.stack = p.i; return el;
}
function abbr(n) { return n >= 10000 ? Math.round(n / 1000) + "k" : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n); }
function openStack(id) {
  const sk = st.stacks && st.stacks.get(id); if (!sk) return;
  if (sk.members.length <= 8) spiderfy(sk); else renderStackList(sk);
}
function spiderfy(sk) {
  unspiderfy(); st.spider = sk.id;
  const c = map.project(sk.coords), n = sk.members.length, R = 46 + n * 4, feats = [];
  sk.members.forEach((f, k) => {
    const a = -Math.PI / 2 + k * 2 * Math.PI / n, ll = map.unproject([c.x + R * Math.cos(a), c.y + R * Math.sin(a)]).toArray();
    feats.push({ type: "Feature", geometry: { type: "LineString", coordinates: [sk.coords, ll] }, properties: { leg: 1 } });
    feats.push({ type: "Feature", geometry: { type: "Point", coordinates: ll }, properties: { ...f.properties } });
  });
  map.getSource("spider").setData({ type: "FeatureCollection", features: feats });
  const el = document.querySelector(`.donut[data-stack="${sk.id}"]`); if (el) el.classList.add("open");
}
function unspiderfy() {
  if (!st.spider || !map.getSource("spider")) return; st.spider = null;
  map.getSource("spider").setData({ type: "FeatureCollection", features: [] });
  document.querySelectorAll(".donut.open").forEach(e => e.classList.remove("open"));
}
async function previewLine(f) {
  try { const r = await getDetail(f.properties.i); if (!r) return null; const t = (r.summary || "").replace(/\s+/g, " ");
    return { text: t.length > 150 ? t.slice(0, 150).replace(/\s\S*$/, "") + "…" : t, date: r.date, time: r.time }; } catch (e) { return null; }
}
function renderStackList(sk, opts = {}) {
  unspiderfy(); clearSelection();
  const qs = new Set(sk.members.map(f => f.properties.q || "")), q = qs.size === 1 ? [...qs][0] : "";
  $("#detail-kicker").innerHTML = `<span class="badge stackb">${sk.members.length} events at this spot</span>`;
  $("#detail-body").innerHTML = `<h2 class="d-title">${sk.members.length} events at this location</h2>
   ${q ? `<div class="approx">⚠️ ${precNote(q)}: these reports were geocoded to the same point, so they're grouped here.</div>` : ""}
   <p class="hint">Showing events that match your current filters, best-scored first. Tap one to open it.</p>
   <ul class="stack-list">${sk.members.map(f => { const p = f.properties, t = TYPES[p.t]; return `<li><button type="button" data-id="${esc(p.i)}">
     <span class="sl-ic">${shapeSVG(t, 16)}</span><span class="sl-main"><span class="sl-t">${esc(p.n)}</span>
     <span class="sl-m">${esc(t.label)} · <span data-date="${esc(p.i)}">${esc(fmtDate(p.d ? String(p.d).slice(0, 4) + "-" + String(p.d).slice(4, 6) : null))}</span>${p.o ? ` · <b class="oc-t oc-${p.o}">${esc(Object.fromEntries(OUTCOMES)[p.o])}</b>` : ""}${p.m ? " · Missing 411" : ""}${p.q ? " · " + esc(precNote(p.q).replace("Location approximate", "approx.").replace(/, not an exact.*\)/, ")")) : ""}</span>
     <span class="sl-p" data-prev="${esc(p.i)}"></span></span><span class="sl-s ${t.id === "mass" || p.u ? "uq" : ""}">${p.s}</span></button></li>`; }).join("")}</ul>`;
  $("#detail-body").scrollTop = 0; openSheet("detail");
  if (!opts.noNav) navPush("list", "#list", () => closeSheetRaw("detail"), { data: sk, replaceKeys: ["event"].concat(isPhone() ? ["filters"] : []) });
  $("#detail-body").querySelector(".stack-list").onclick = e => { const b = e.target.closest("button[data-id]"); if (b) selectEvent(b.dataset.id); };
  // one-line previews, fetched lazily (detail chunks are cached)
  sk.members.slice(0, 80).forEach(async f => {
    const r = await previewLine(f), id = CSS.escape(f.properties.i); if (!r) return;
    const el = document.querySelector(`[data-prev="${id}"]`), de = document.querySelector(`[data-date="${id}"]`);
    if (el) el.textContent = r.text; if (de) de.textContent = fmtDate(r.date) + (r.time ? " " + r.time : "");
  });
}
/* ---- cluster donuts: proportional ring of type colours around the count (HTML markers, pointer-events off) ---- */
const DONUT_R = (matchMedia("(max-width: 820px)").matches ? [12, 14, 17, 21, 25] : [15, 18, 22, 27, 33]);
let donutCache = {}, donutsOn = {};
function clearDonuts() { for (const m of Object.values(donutsOn)) m.remove(); donutCache = {}; donutsOn = {}; }
function donutEl(p, isStack) {
  if (p.n) { p = { ...p, point_count: p.n, point_count_abbreviated: abbr(p.n) }; }
  const n = p.point_count, r = n < 10 ? DONUT_R[0] : n < 100 ? DONUT_R[1] : n < 1000 ? DONUT_R[2] : n < 10000 ? DONUT_R[3] : DONUT_R[4];
  const w = Math.max(5, Math.round(r * 0.36)), r0 = r - w, sz = r * 2 + 8, cx = sz / 2;
  const counts = TYPES.map((t, i) => p["c" + i] || 0), tot = counts.reduce((a, b) => a + b, 0) || 1;
  let segs = "", acc = 0;
  const pt = (rad, f) => [cx + rad * Math.sin(2 * Math.PI * f), cx - rad * Math.cos(2 * Math.PI * f)];
  counts.forEach((c, i) => {
    if (!c) return; const f0 = acc / tot, f1 = (acc += c) / tot;
    if (c === tot) { segs += `<circle cx="${cx}" cy="${cx}" r="${r - w / 2}" fill="none" stroke="${TYPES[i].color}" stroke-width="${w}"/>`; return; }
    const lg = f1 - f0 > 0.5 ? 1 : 0, [x0, y0] = pt(r, f0), [x1, y1] = pt(r, f1), [x2, y2] = pt(r0, f1), [x3, y3] = pt(r0, f0);
    segs += `<path d="M${x0} ${y0}A${r} ${r} 0 ${lg} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${lg} 0 ${x3} ${y3}Z" fill="${TYPES[i].color}"/>`;
  });
  const el = document.createElement("div"); el.className = "donut";
  if (isStack) segs += `<circle cx="${cx}" cy="${cx}" r="${r + 3.5}" fill="none" stroke="#fff" stroke-width="1.6" stroke-dasharray="3 2.4"/>`;
  el.title = TYPES.map((t, i) => counts[i] ? `${t.label}: ${counts[i]}` : "").filter(Boolean).join("\n");
  el.innerHTML = `<svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}"><circle cx="${cx}" cy="${cx}" r="${r + 1.5}" fill="#0a0c18" opacity="0.85"/>${segs}<circle cx="${cx}" cy="${cx}" r="${r0 - 0.5}" fill="rgba(10,12,28,0.9)"/><text x="${cx}" y="${cx}" dy="0.36em" text-anchor="middle" font-size="${r < 20 ? 11 : 12.5}" font-weight="700" fill="#fff">${p.point_count_abbreviated}</text></svg>`;
  return el;
}
function updateDonuts() {
  if (!map || !map.getSource("events") || !map.isSourceLoaded("events")) return;
  const next = {};
  for (const f of map.querySourceFeatures("events")) {
    const p = f.properties; if (!p.cluster && !p.g) continue;
    const id = p.cluster ? "c" + p.cluster_id : "s" + p.i; if (next[id]) continue;
    let m = donutCache[id];
    if (!m) m = donutCache[id] = new maplibregl.Marker({ element: p.cluster ? donutEl(p) : stackEl(p), opacityWhenCovered: "0" }).setLngLat(f.geometry.coordinates);
    next[id] = m; if (!donutsOn[id]) m.addTo(map);
  }
  for (const id in donutsOn) if (!next[id]) donutsOn[id].remove();
  donutsOn = next;
}
function domColorExpr() {
  const cases = ["case"];
  for (let i = 0; i < TYPES.length; i++) {
    const conds = ["all"]; for (let j = 0; j < TYPES.length; j++) if (j !== i) conds.push([">=", ["get", "c" + i], ["get", "c" + j]]);
    cases.push(conds, TYPES[i].color);
  }
  cases.push("#888"); return cases;
}
function dashedRing(color, size = 44) {
  const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d");
  g.fillStyle = color + "55"; g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 6, 0, 7); g.fill();
  g.lineWidth = 5.5; g.strokeStyle = "rgba(10,12,24,0.8)"; g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 4, 0, 7); g.stroke();
  g.setLineDash([5, 4]); g.lineWidth = 3.5; g.strokeStyle = "#fff"; g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 4, 0, 7); g.stroke();
  g.setLineDash([]); g.fillStyle = color; g.beginPath(); g.arc(size / 2, size / 2, size / 5, 0, 7); g.fill();
  return { width: size, height: size, data: g.getImageData(0, 0, size, size).data };
}
function addLayers() {
  const empty = { type: "FeatureCollection", features: [] };
  const clusterProps = { n: ["+", ["coalesce", ["get", "g"], 1]] };
  TYPES.forEach((t, i) => clusterProps["c" + i] = ["+", ["coalesce", ["get", "g" + i], ["case", ["==", ["get", "t"], i], 1, 0]]]);
  map.addSource("events", { type: "geojson", data: { type: "FeatureCollection", features: st.mapFeats || [] }, cluster: true, clusterMaxZoom: 13, clusterRadius: 48, clusterProperties: clusterProps, buffer: 64, tolerance: 0.5 });
  ["community", "arcs", "theories", "waves", "sel", "ctx", "visitors"].forEach(id => map.addSource(id, { type: "geojson", data: empty }));
  TYPES.forEach(t => { if (!map.hasImage("ring-" + t.id)) map.addImage("ring-" + t.id, dashedRing(t.color), { pixelRatio: 2 });
    if (!map.hasImage("sh-" + t.id)) map.addImage("sh-" + t.id, shapeIcon(t, false), { pixelRatio: 2 });
    if (!map.hasImage("sh-" + t.id + "-c")) map.addImage("sh-" + t.id + "-c", shapeIcon(t, true), { pixelRatio: 2 }); });
  const font = C.FONT;
  map.addSource("cities", { type: "geojson", data: { type: "FeatureCollection", features: st.cityFeats || [] }, buffer: 32,
    attribution: 'City names: <a href="https://www.geonames.org/" target="_blank" rel="noopener">GeoNames</a> (CC BY 4.0)' });
  // tiers: [min population, max population, minzoom, text size, font]; added smallest-first so major cities win collisions
  [...CITY_TIERS].reverse().forEach(([lo, hi, mz, size, bold], k) => map.addLayer({ id: "city-" + (CITY_TIERS.length - 1 - k), type: "symbol", source: "cities", minzoom: mz,
    filter: ["all", [">=", ["get", "p"], lo], ["<", ["get", "p"], hi]],
    layout: { "text-field": ["get", "n"], "text-font": bold ? ["Noto Sans Bold"] : font, "text-size": ["interpolate", ["linear"], ["zoom"], mz, size, mz + 6, size + 2],
      "symbol-sort-key": ["-", 0, ["get", "p"]], "text-padding": 4,
      // offset from the exact city point, where clusters/pins usually sit, so names stay readable beside them
      "text-variable-anchor": ["top", "bottom", "left", "right"], "text-radial-offset": mz >= 9 ? 0.9 : 1.5, "text-justify": "auto", "text-max-width": 8, "text-allow-overlap": false, "text-optional": false,
      "text-letter-spacing": bold ? 0.02 : 0 },
    paint: { "text-color": "#ffffff", "text-halo-color": "rgba(6,10,24,0.88)", "text-halo-width": 1.6, "text-halo-blur": 0.4,
      "text-opacity": ["interpolate", ["linear"], ["zoom"], mz, 0.75, mz + 0.6, 1] } }));
  map.addLayer({ id: "ctx-pts", type: "circle", source: "ctx", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.5, 8, 6], "circle-color": "rgba(10,12,24,0.55)", "circle-stroke-width": 2, "circle-stroke-color": ["match", ["get", "k"], "military", "#ff7b7b", "launch", "#ffc46b", "airport", "#d6dcff", "#ccc"] } });
  map.addLayer({ id: "ctx-lbl", type: "symbol", source: "ctx", minzoom: 5, layout: { "text-field": ["get", "name"], "text-font": font, "text-size": 11, "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true }, paint: { "text-color": "#ffd0c4", "text-halo-color": "#000", "text-halo-width": 1.2 } });
  map.addLayer({ id: "visitors", type: "circle", source: "visitors", paint: { "circle-radius": ["interpolate", ["linear"], ["get", "visits"], 1, 4, 100, 14, 10000, 30], "circle-color": "#ffffff", "circle-opacity": 0.18, "circle-stroke-color": "#fff", "circle-stroke-width": 1.2 } });
  map.addLayer({ id: "waves", type: "circle", source: "waves", paint: { "circle-radius": ["interpolate", ["linear"], ["get", "count"], 12, 18, 200, 46], "circle-color": "rgba(255,240,140,0.06)", "circle-stroke-color": "#fff08c", "circle-stroke-width": 1.5, "circle-stroke-opacity": 0.7 } });
  // clusters: an (almost) invisible hit circle for taps; the visible donut (type mix + count) is an HTML marker, see updateDonuts()
  map.addLayer({ id: "clusters", type: "circle", source: "events", filter: ["has", "point_count"], paint: {
    "circle-color": domColorExpr(), "circle-opacity": 0.004, "circle-stroke-width": 0,
    "circle-radius": ["step", ["get", "n"], DONUT_R[0], 10, DONUT_R[1], 100, DONUT_R[2], 1000, DONUT_R[3], 10000, DONUT_R[4]] } });
  map.addLayer({ id: "stacks", type: "circle", source: "events", filter: ["all", ["!", ["has", "point_count"]], ["has", "g"]], paint: {
    "circle-color": "#000", "circle-opacity": 0.004, "circle-radius": ["step", ["get", "g"], DONUT_R[0], 10, DONUT_R[1], 100, DONUT_R[2], 1000, DONUT_R[3]] } });
  map.addLayer({ id: "pts", type: "symbol", source: "events", filter: ["all", ["!", ["has", "point_count"]], ["!", ["has", "g"]]], layout: {
    "icon-image": ["concat", "sh-", ["match", ["get", "t"], ...TYPES.flatMap((t, i) => [i, t.id]), "other"], ["case", ["==", ["get", "c"], 1], "-c", ""]],
    "icon-size": ["interpolate", ["linear"], ["zoom"], 2, 0.72, 8, 0.95, 14, 1.15], "icon-allow-overlap": true, "icon-ignore-placement": true,
    "symbol-sort-key": ["get", "c"] } });
  map.addLayer({ id: "community", type: "symbol", source: "community", layout: { "icon-image": ["concat", "ring-", ["get", "type"]], "icon-size": ["interpolate", ["linear"], ["zoom"], 2, 0.8, 12, 1.2], "icon-allow-overlap": true } });
  map.addLayer({ id: "arcs-case", type: "line", source: "arcs", layout: { "line-cap": "round", "line-join": "round" }, paint: {
    "line-color": "#060814", "line-width": ["interpolate", ["linear"], ["get", "s"], 0, 3, 1, 8], "line-opacity": 0.5, "line-blur": 1 } });
  map.addLayer({ id: "arcs", type: "line", source: "arcs", layout: { "line-cap": "round", "line-join": "round" }, paint: {
    "line-color": ["coalesce", ["get", "col"], "#ffffff"], "line-width": ["interpolate", ["linear"], ["get", "s"], 0, 1, 1, 5],
    "line-opacity": ["interpolate", ["linear"], ["get", "s"], 0, 0.55, 1, 0.95] } });
  map.addLayer({ id: "arcs-hit", type: "line", source: "arcs", paint: { "line-color": "#000", "line-opacity": 0.01, "line-width": 16 } });
  map.addLayer({ id: "theories", type: "line", source: "theories", layout: { "line-cap": "round" }, paint: { "line-color": "#ff7ad9", "line-width": 2.5, "line-dasharray": [2, 2], "line-opacity": 0.9 } });
  map.addLayer({ id: "theories-hit", type: "line", source: "theories", paint: { "line-color": "#000", "line-opacity": 0.01, "line-width": 16 } });
  map.addLayer({ id: "theories-lbl", type: "symbol", source: "theories", layout: { "symbol-placement": "line-center", "text-field": ["concat", "Community theory: ", ["get", "label"]], "text-font": font, "text-size": 12, "text-optional": true }, paint: { "text-color": "#ffc6ee", "text-halo-color": "#1a0b24", "text-halo-width": 1.5 } });
  map.addSource("spider", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "spider-legs", type: "line", source: "spider", filter: ["has", "leg"], paint: { "line-color": "#ffffff", "line-width": 1.6, "line-opacity": 0.85 } });
  map.addLayer({ id: "spider-pts", type: "symbol", source: "spider", filter: ["!", ["has", "leg"]], layout: {
    "icon-image": ["concat", "sh-", ["match", ["get", "t"], ...TYPES.flatMap((t, i) => [i, t.id]), "other"], ["case", ["==", ["get", "c"], 1], "-c", ""]],
    "icon-size": 1.2, "icon-allow-overlap": true, "icon-ignore-placement": true } });
  map.addLayer({ id: "sel", type: "circle", source: "sel", paint: { "circle-radius": 14, "circle-color": "rgba(255,255,255,0.08)", "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } });
}
function refreshAll() {
  if (!map.getSource("events")) return;
  clearDonuts(); map.getSource("events").setData({ type: "FeatureCollection", features: st.mapFeats || [] });
  renderCommunity(); renderArcs(); renderTheories(); renderWaves(); renderCtx(); renderVisitors(); renderSel();
}

/* ------------------------------------------------------------ data loading */
async function loadType(t) {
  if (st.pts[t]) return st.pts[t];
  if (st.loading[t]) return st.loading[t];
  st.loading[t] = (async () => {
    const col = await getJSON(`data/points/${t}.json${V}`);
    const ti = TI[t], feats = new Array(col.lon.length), cur = new Set(col.c || []);
    for (let i = 0; i < col.lon.length; i++) {
      const p = { i: t + "-" + i, t: ti, d: col.d[i], s: col.s[i], n: col.n[i] };
      if (cur.has(i)) p.c = 1; const k = col.k[i]; if (k) p.k = k; const w = col.w[i]; if (w !== undefined) p.w = w;
      const q = col.q && col.q[i] !== undefined ? col.q[i] : col.qd; if (q) p.q = q;
      if (col.o && col.o[i]) p.o = col.o[i]; if (col.m && col.m[i]) p.m = col.m[i];
      feats[i] = { type: "Feature", geometry: { type: "Point", coordinates: [col.lon[i], col.lat[i]] }, properties: p };
    }
    (col.u || []).forEach(i => feats[i].properties.u = 1); (col.pm || []).forEach(i => feats[i].properties.pm = 1);
    st.pts[t] = feats; indexGrid(feats); return feats;
  })();
  return st.loading[t];
}
function indexGrid(feats) { for (const f of feats) { const [lo, la] = f.geometry.coordinates; const key = Math.floor(la) * 1000 + Math.floor(lo); let a = st.grid.get(key); if (!a) st.grid.set(key, a = []); a.push(f); } }
function splitId(id) { const k = id.lastIndexOf("-"); return [id.slice(0, k), +id.slice(k + 1)]; }
function ptById(id) { const [t, n] = splitId(id); return st.pts[t] && st.pts[t][n]; }
async function getDetail(id) {
  if (id.startsWith("c:")) { const c = st.community.find(x => "c:" + x.id === id); return c ? communityRecord(c) : null; }
  const [t, n] = splitId(id); if (!st.manifest.files[t]) return null;
  const key = `${t}/${Math.floor(n / st.manifest.files[t].chunk_size)}`;
  if (!st.detailCache[key]) st.detailCache[key] = getJSON(`data/detail/${key}.json${V}`);
  const recs = await st.detailCache[key]; const r = recs[id]; if (!r) return null;
  const f = ptById(id);
  return { ...r, id, type: t, q: f ? f.properties.q : undefined, lon: f ? f.geometry.coordinates[0] : null, lat: f ? f.geometry.coordinates[1] : null };
}

/* ------------------------------------------------------------ filtering */
let fTimer;
function scheduleFilter() { clearTimeout(fTimer); fTimer = setTimeout(applyFilters, 160); }
async function applyFilters() {
  const need = [...st.enabled].filter(t => !st.pts[t]);
  if (need.length) await Promise.all(need.map(loadType));
  const q = st.q.trim().toLowerCase(), y0 = st.years[0] * 10000, y1 = st.years[1] * 10000 + 1231;
  const out = [], counts = Object.fromEntries(TYPES.map(t => [t.id, 0])), totals = {};
  for (const t of TYPES) {
    const arr = st.pts[t.id]; totals[t.id] = arr ? arr.length : st.manifest.counts_by_type[t.id];
    if (!arr) continue;
    const on = st.enabled.has(t.id), mass = t.id === "mass";
    for (const f of arr) {
      const p = f.properties, [lo, hi] = mass || p.u ? st.uq : st.cred;
      if (p.s < lo || p.s > hi) continue;
      if (p.o && !st.outcomes.has(p.o)) continue;
      if (st.m411 && !p.m) continue;
      if (p.d) { if (p.d < y0 || p.d > y1) continue; } else if (!st.undated) continue;
      if (q && !p.n.toLowerCase().includes(q)) continue;
      counts[t.id]++; if (on) out.push(f);
    }
  }
  let cc = 0;
  st.communityFiltered = st.community.filter(c => {
    const [lo, hi] = c.type === "mass" ? st.uq : st.cred, s = c._score.value;
    if (s < lo || s > hi) return false; const d = c.event_date ? +String(c.event_date).replace(/-/g, "") : 0;
    if (d) { if (d < y0 || d > y1) return false; } else if (!st.undated) return false;
    if (q && !(c.title + " " + (c.description || "")).toLowerCase().includes(q)) return false;
    if (!st.enabled.has(c.type) || st.m411) return false; cc++; return st.community_on;
  });
  st.filtered = out; st.mapFeats = groupStacks(out); st.counts = counts; st.totals = totals; st.communityCount = cc;
  const shown = out.length + st.communityFiltered.length;
  const all = Object.values(totals).reduce((a, b) => a + b, 0) + st.community.length;
  $("#total-shown").textContent = fmtN(shown); $("#total-all").textContent = fmtN(all);
  $("#count-badge").textContent = shown >= 1000 ? (shown / 1000).toFixed(shown >= 1e4 ? 0 : 1) + "k" : shown;
  renderTypeList();
  if (map && map.getSource("events")) { clearDonuts(); unspiderfy(); map.getSource("events").setData({ type: "FeatureCollection", features: st.mapFeats }); renderCommunity(); }
}
function renderTypeList() {
  const rows = TYPES.map(t => `<li><button data-type="${t.id}" aria-pressed="${st.enabled.has(t.id)}"><span class="dot">${shapeSVG(t, 16)}</span><span class="tl">${esc(t.label)}${t.sub ? `<span class="sub">${t.sub}</span>` : ""}</span><span class="tc">${st.counts ? fmtN(st.counts[t.id]) : "…"}</span></button></li>`);
  rows.push(`<li><button data-type="community" aria-pressed="${st.community_on}"><span class="dot">${shapeSVG(null, 16, true)}</span><span class="tl">Community reports<span class="sub">${S.available === false || !S.enabled ? "Not enabled yet" : "Unreviewed, user-submitted"}</span></span><span class="tc">${fmtN(st.communityCount || 0)}</span></button></li>`);
  $("#type-list").innerHTML = rows.join("");
  $("#uq-wrap").hidden = !st.enabled.has("mass") && !st.enabled.has("disappearance");
  renderMissingFilters();
}

/* ---- missing-person filters: outcome chips + Missing 411 toggle (only records that carry these fields are affected) ---- */
const OUTCOMES = [["a", "Found alive"], ["d", "Found deceased"], ["n", "Never found"], ["u", "Unknown"]];
function renderMissingFilters() {
  const box = $("#missing-wrap"); if (!box) return;
  box.hidden = !st.enabled.has("disappearance");
  const arr = st.pts.disappearance || [], oc = { a: 0, d: 0, n: 0, u: 0 }; let m = 0;
  for (const f of arr) { const p = f.properties; if (p.o) oc[p.o]++; if (p.m) m++; }
  $("#outcome-chips").innerHTML = OUTCOMES.map(([k, l]) => `<button type="button" class="chip oc-${k}" data-oc="${k}" aria-pressed="${st.outcomes.has(k)}">${l} <small>${fmtN(oc[k])}</small></button>`).join("");
  $("#m411-count").textContent = fmtN(m);
}
function outcomeHTML(o) {
  if (!o) return "";
  return `<div class="outcome oc-${o.code[0]}"><span class="oc-l">Outcome</span><b>${esc(o.label)}</b>${o.date ? ` <small>(${esc(fmtDate(o.date))})</small>` : ""}
    ${o.note ? `<div class="oc-n">${esc(o.note)}</div>` : ""}</div>`;
}
function m411HTML(m) {
  if (!m) return "";
  return `<div class="sec m411"><h4>Missing 411 tag${m.confidence === "low" ? ": low confidence" : ""}</h4>
    <p>${esc(m.ref || "Missing 411")}. <i>Missing 411</i> is a book and film series by David Paulides. The tag only notes that the case is reportedly covered there; the facts above come from independent sources, and no claims from the series are used or endorsed.</p>
    ${m.note ? `<p class="hint">Tag basis: ${esc(m.note)}${m.url ? ` · <a href="${esc(m.url)}" target="_blank" rel="noopener">source</a>` : ""}</p>` : ""}</div>`;
}
function probableHTML(r) {
  if (!r.probable) return "";
  return `<div class="probable"><b>Probable match</b> Some records here were linked to this case on a probable basis (same park and a close date), not a confirmed one. They could belong to a different person or incident.
    <ul>${r.probable.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
}
/* ------------------------------------------------------------ selection + detail */
function clearSelection() {
  st.selected = null; st.arcs = [];
  if (map && map.getSource("sel")) { renderSel(); renderArcs(); }

}
function renderSel() { const s = st.selected; map.getSource("sel").setData({ type: "FeatureCollection", features: s && s.lon != null ? [{ type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: {} }] : [] }); }
async function selectEvent(id, opts = {}) {
  if (st.mode === "link" && st.linkA && id !== st.linkA.id) { const b = await getDetail(id); if (b) return openTheoryForm(st.linkA, b); }
  let r; try { r = await getDetail(id); } catch (e) { toast("Couldn't load details."); return; }
  if (!r) { toast("Event not found."); return; }
  st.selected = r; renderSel(); renderDetail(r); openSheet("detail");
  if (!opts.noNav) {
    const top = navTop(), list = top && top.key === "list" ? top.data : null;
    navPush("event", "#event=" + encodeURIComponent(id), list ? () => renderStackList(list, { noNav: true }) : () => closeSheetRaw("detail"),
      { replaceKeys: isPhone() ? ["filters"] : [] });
  }
  if (opts.fly && r.lon != null) map.flyTo({ center: [r.lon, r.lat], zoom: Math.max(map.getZoom(), opts.zoom || 7), speed: 1.4, padding: flyPad() });
  computeArcs(r); renderArcs(); renderDetailLinks(r);
  ensureCtx().then(() => renderPattern(r)).catch(() => {});
}
function flyPad() { return isPhone() ? { bottom: innerHeight * 0.45, top: 60, left: 0, right: 0 } : { right: 420, left: $("#filters").dataset.state !== "closed" ? 350 : 0, top: 60, bottom: 30 }; }
function scoreHTML(sc) {
  const uq = sc.kind === "unanswered";
  const rows = (sc.breakdown || []).map(b => Array.isArray(b) ? b : [b.label, b.pts]).map(([l, p]) => {
    const base = l.indexOf("Baseline") === 0; return `<tr><td>${esc(l)}</td><td class="${!base && p > 0 ? "pos" : p < 0 ? "neg" : ""}">${!base && p > 0 ? "+" : ""}${p}</td></tr>`; }).join("");
  let extra = "";
  if (uq && sc.facts) {
    const mot = { established: "Yes", partial: "Partly (contributing factors, no single motive)", undetermined: "No: officially undetermined" }[sc.facts.motive];
    const inv = { closed_clear: "Closed, clear findings", closed_undetermined: "Closed, motive undetermined", open: "Open", unsolved: "Unsolved" }[sc.facts.investigation];
    extra = `<dl class="facts"><dt>Motive established?</dt><dd>${esc(mot)}</dd><dt>Investigation</dt><dd>${esc(inv)}</dd></dl>` +
      (sc.questions && sc.questions.length ? `<div class="sec"><h4>Documented open questions</h4><ul class="ev">${sc.questions.map(q => `<li>${esc(q.text)} <a href="${esc(q.source.url)}" target="_blank" rel="noopener">${esc(q.source.label)}</a></li>`).join("")}</ul></div>` : "");
  }
  return `<div class="score ${uq ? "uq" : ""}"><div class="score-top"><div class="gauge" style="--v:${sc.value}"><span>${sc.value}</span></div><div><div class="score-label">${uq ? "Unanswered-questions score" : "Credibility score"}</div>
   <div class="score-sub">${sc.sub ? esc(sc.sub) : uq ? "Scores the <b>why</b>: how unresolved the motive is per official findings. It does not measure whether it happened." : "Disproof weighs heavily; absence of disproof keeps the score up."}</div></div></div>
   ${extra}<table class="breakdown">${rows}<tr><td><b>Total</b> (clamped 0–100)</td><td><b>${sc.value}</b></td></tr></table></div>`;
}
function rumorsHTML(r) {
  const list = r.rumors || [], isMass = r.type === "mass";
  if (!list.length) return r.src === "curated" || r.community ? `<details class="rumors"><summary>🛸 Rumors &amp; Theories <small style="font-weight:400;opacity:.7">(none)</small></summary><p class="rum-note">No rumors yet. This section is just for fun and never affects scores.</p></details>` : "";
  return `<details class="rumors"><summary>${isMass ? "🗂️ Widely reported theories &amp; what investigators found" : "🛸 Rumors &amp; Theories"} <small style="font-weight:400;opacity:.7">(${list.length})</small></summary>
   <p class="rum-note">${isMass ? "Out of respect for the victims, this lists only widely reported claims, each paired with investigators' findings. Nothing here is presented as fact, and none of it changes the Unanswered-questions score." : "Just for fun: unverified stories and theories, kept separate from the facts above. Nothing here affects the credibility score."}</p>
   ${list.map(x => { const tag = x.status.startsWith("Partly") ? "Partly" : x.status; return `<div class="rumor"><span class="tag ${tag}">${esc(x.status)}</span><p>${esc(x.text)}</p>
     <div class="src-l">Reported in: <a href="${esc(x.source.url)}" target="_blank" rel="noopener">${esc(x.source.label)}</a></div>
     ${x.finding ? `<div class="finding"><b>What investigators found</b>${esc(x.finding)}<div class="src-l">${(x.finding_source || []).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`).join(" · ")}</div></div>` : ""}</div>`; }).join("")}</details>`;
}
function renderDetail(r) {
  const t = TYPES[TI[r.type]] || TYPES[7];
  $("#detail-kicker").innerHTML = `<span class="badge" style="border:1px solid ${t.color}66">${shapeSVG(t, 13)}${esc(t.label)}</span>` + (r.community ? `<span class="badge unrev">Unreviewed community report</span>` : r.src === "curated" ? `<span class="badge cur">Curated case</span>` : r.src === "np-missing" ? `<span class="badge nps">NPS missing-person record</span>` : "")
    + (r.probable ? `<span class="badge prob">Probable match</span>` : "") + (r.missing411 ? `<span class="badge m411b">Missing 411${r.missing411.confidence === "low" ? " (low confidence)" : ""}</span>` : "");
  const imgs = (r.images || []).map(im => `<figure class="img-fig"><img loading="lazy" src="${esc(im.src)}${V}" alt="${esc(r.title)}"><figcaption>${esc(im.credit)} · ${esc(im.license)} · <a href="${esc(im.page)}" target="_blank" rel="noopener">Wikimedia Commons</a></figcaption></figure>`).join("");
  const ex = (r.excerpts || []).map(e => `<blockquote>“${esc(e.text)}”<cite>— ${esc(e.by)}</cite></blockquote>`).join("");
  const srcs = (r.sources || []).slice(), gen = st.manifest.sources[r.src];
  if (gen && r.src !== "curated") srcs.push({ label: "Dataset: " + gen.name, url: gen.url });
  const lic = r.license || (gen && gen.license) || "";
  $("#detail-body").innerHTML = `<h2 class="d-title">${esc(r.title)}</h2>
   <div class="d-meta">📅 ${esc(fmtDate(r.date))}${r.time ? " " + esc(r.time) : ""} · 📍 ${esc(r.place || "")}</div>${precNote(r.q) ? `<div class="approx">⚠️ ${precNote(r.q)}</div>` : ""}
   ${outcomeHTML(r.outcome)}${imgs}<p>${esc(r.summary || "")}</p>${probableHTML(r)}${r.link_confidence === "low" ? `<div class="approx">Park connection: low confidence. The source ties this case to the park only loosely (for example, a vehicle or item found there).</div>` : ""}${scoreHTML(r.score)}${m411HTML(r.missing411)}
   ${ex ? `<div class="sec"><h4>Witness statements</h4>${ex}</div>` : ""}
   ${(r.evidence || []).length ? `<div class="sec"><h4>Evidence notes</h4><ul class="ev">${r.evidence.map(e => `<li>${esc(e)}</li>`).join("")}</ul></div>` : ""}
   ${r.photo ? `<figure class="img-fig"><img loading="lazy" src="${esc(r.photo)}" alt="Submitted photo"><figcaption>Photo submitted with this unreviewed report</figcaption></figure>` : ""}
   <div class="sec"><h4>Sources</h4><ul class="src">${srcs.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join("") || "<li>No source links.</li>"}</ul>${lic ? `<p class="hint">License: ${esc(lic)}</p>` : ""}${!(r.images || []).length && !r.community ? `<p class="hint">Images appear only when public domain or openly licensed; otherwise follow the source links.</p>` : ""}</div>
   ${rumorsHTML(r)}<div id="pattern"></div>
   <div class="sec"><h4>Connections <small style="text-transform:none;letter-spacing:0">(within ${st.days} days &amp; ${st.km} km)</small></h4><div id="d-links"><p class="hint">Computing…</p></div></div>
   <div class="d-actions"><button class="btn ghost small" id="d-zoom">🔍 Zoom to street level</button><button class="btn ghost small" id="d-theory">💭 Draw a theory line</button><button class="btn ghost small" id="d-share">🔗 Share</button></div>`;
  $("#detail-body").scrollTop = 0;
  $("#d-zoom").onclick = () => r.lon != null && map.flyTo({ center: [r.lon, r.lat], zoom: 15, speed: 1.2, padding: flyPad() });
  $("#d-theory").onclick = () => startLinkMode(r);
  $("#d-share").onclick = () => { const u = shareURL(r.id); if (navigator.share && isPhone()) navigator.share({ title: r.title, url: u }).catch(() => {}); else if (navigator.clipboard) navigator.clipboard.writeText(u).then(() => toast("Link copied")); };
}

/* ------------------------------------------------------------ correlations (client-side) */
function kwList(mask) { const k = st.manifest.keywords, o = []; for (let i = 0; i < k.length; i++) if (mask & (1 << i)) o.push(k[i]); return o; }
function computeArcs(r) {
  st.arcs = [];
  if (!st.autoconnect || r.lon == null) return;
  const sel = r.community ? null : ptById(r.id);
  const sp = sel ? sel.properties : { d: r.date ? +String(r.date).replace(/-/g, "") : 0, k: 0, t: TI[r.type] };
  const ord = dToOrd(sp.d), N = st.days, X = st.km, lat = r.lat, lon = r.lon;
  const dLat = Math.ceil(X / 111) + 1, dLon = Math.ceil(X / (111 * Math.max(0.15, Math.cos(lat * Math.PI / 180)))) + 1;
  const cands = [];
  for (let a = Math.floor(lat) - dLat; a <= Math.floor(lat) + dLat; a++) for (let b = Math.floor(lon) - dLon; b <= Math.floor(lon) + dLon; b++) {
    const cell = st.grid.get(a * 1000 + b); if (!cell) continue;
    for (const f of cell) {
      const p = f.properties; if (f === sel || !st.enabled.has(TYPES[p.t].id)) continue;
      const [lo2, la2] = f.geometry.coordinates, dk = hav(lat, lon, la2, lo2); if (dk > X) continue;
      const sameWave = sp.w !== undefined && p.w === sp.w;
      let dt = null; if (ord != null && p.d) dt = Math.abs(dToOrd(p.d) - ord);
      if (!sameWave && (dt == null || dt > N)) continue;
      const why = []; let s = 0;
      if (dt != null) { s += 0.35 * (1 - dt / (N + 1)); why.push(dt === 0 ? "same day/night" : `${dt} day${dt > 1 ? "s" : ""} apart`); }
      s += 0.3 * (1 - dk / X); why.push(`${dk < 10 ? dk.toFixed(1) : Math.round(dk)} km apart`);
      if (p.t === sp.t) { s += 0.1; why.push("same type"); }
      const sh = (p.k || 0) & (sp.k || 0); if (sh) { const l = kwList(sh); s += Math.min(0.2, 0.08 * l.length); why.push("shared keywords: " + l.join(", ")); }
      if (sameWave) { s += 0.15; why.push("same report wave"); }
      if (TYPES[p.t].id === "bluebook") why.push("Blue Book dates are month-level");
      cands.push({ f, s: Math.min(1, s), why });
    }
  }
  if (r.src === "curated") for (const l of st.links) {
    const other = l.a === r.id ? l.b : l.b === r.id ? l.a : null; if (!other) continue;
    const f = ptById(other); if (f && !cands.some(c => c.f === f)) cands.push({ f, s: l.s, why: l.why.concat(["curated link"]) });
  }
  cands.sort((a, b) => b.s - a.s);
  // one arc per distinct location (bulk datasets geocode to city centroids, so many reports share coordinates)
  const byLoc = new Map();
  for (const c of cands) { const k = c.f.geometry.coordinates.join(","); const g = byLoc.get(k); if (!g) byLoc.set(k, c); else g.more = (g.more || 0) + 1; }
  for (const c of byLoc.values()) if (c.more) c.why = c.why.concat([`+${c.more} more correlated report${c.more > 1 ? "s" : ""} at this spot`]);
  st.arcs = [...byLoc.values()].slice(0, 25).map(c => ({ ...c, from: [lon, lat], to: c.f.geometry.coordinates }));
}
function arcLine(a, b, bulge = 0.18) {
  const p = Math.PI / 180, toV = ([lo, la]) => [Math.cos(la * p) * Math.cos(lo * p), Math.cos(la * p) * Math.sin(lo * p), Math.sin(la * p)];
  const A = toV(a), B = toV(b), dot = Math.min(1, Math.max(-1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])), w = Math.acos(dot);
  if (w < 1e-7) return [a, b];
  const Nn = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]], nl = Math.hypot(...Nn) || 1, pts = [], n = 40;
  for (let i = 0; i <= n; i++) {
    const t = i / n, s1 = Math.sin((1 - t) * w) / Math.sin(w), s2 = Math.sin(t * w) / Math.sin(w), off = Math.sin(Math.PI * t) * bulge * w;
    const v = [s1 * A[0] + s2 * B[0] + off * Nn[0] / nl, s1 * A[1] + s2 * B[1] + off * Nn[1] / nl, s1 * A[2] + s2 * B[2] + off * Nn[2] / nl], L = Math.hypot(...v);
    pts.push([Math.atan2(v[1], v[0]) / p, Math.asin(v[2] / L) / p]);
  }
  for (let i = 1; i < pts.length; i++) { while (pts[i][0] - pts[i - 1][0] > 180) pts[i][0] -= 360; while (pts[i][0] - pts[i - 1][0] < -180) pts[i][0] += 360; }
  return pts;
}
function renderArcs() {
  if (!map || !map.getSource("arcs")) return;
  const feats = (st.arcs || []).map(a => ({ type: "Feature", geometry: { type: "LineString", coordinates: arcLine(a.from, a.to) }, properties: { s: a.s, why: a.why.join(" · "), n: a.f.properties.n, col: (TYPES[a.f.properties.t] || {}).color } }));
  if (st.connections && !st.selected) for (const l of st.links) {
    const fa = ptById(l.a), fb = ptById(l.b); if (!fa || !fb) continue;
    feats.push({ type: "Feature", geometry: { type: "LineString", coordinates: arcLine(fa.geometry.coordinates, fb.geometry.coordinates) }, properties: { s: l.s, why: l.why.join(" · "), n: fa.properties.n + " ↔ " + fb.properties.n, col: (TYPES[fb.properties.t] || {}).color } });
  }
  map.getSource("arcs").setData({ type: "FeatureCollection", features: feats });
}
function renderDetailLinks(r) {
  const el = $("#d-links"); if (!el) return;
  const th = st.theories.filter(x => x.a_id === r.id || x.b_id === r.id);
  const thHTML = th.length ? `<h4 style="margin-top:10px">Community theories <small>(speculation, unreviewed)</small></h4><ul class="ev">${th.map(x => `<li><b>${esc(x.label)}</b>${x.note ? ": " + esc(x.note) : ""} <small>(${esc(x.display_name || "anonymous")})</small></li>`).join("")}</ul>` : "";
  if (!st.autoconnect) { el.innerHTML = `<p class="hint">Arc drawing is off (Filters → Connections).</p>` + thHTML; return; }
  if (!st.arcs.length) { el.innerHTML = `<p class="hint">No correlated events within ${st.days} days and ${st.km} km among the visible types. Widen the window in Filters → Connections.</p>` + thHTML; return; }
  el.innerHTML = `<ul class="links-list">${st.arcs.map(a => `<li><button data-id="${esc(a.f.properties.i)}"><span class="str" style="opacity:${0.35 + a.s * 0.65};width:${12 + a.s * 30}px"></span><span>${esc(a.f.properties.n)}<small>Why linked: ${esc(a.why.join(" · "))} · strength ${(a.s * 100).toFixed(0)}</small></span></button></li>`).join("")}</ul>` + thHTML;
  el.querySelectorAll("button[data-id]").forEach(b => b.onclick = () => selectEvent(b.dataset.id, { fly: true }));
}

/* ------------------------------------------------------------ context layers + pattern notes (speculation) */
async function ensureCtx() { if (!st.ctx) st.ctx = await getJSON(`data/context.json${V}`); return st.ctx; }
function nearest(list, lat, lon, maxKm) { let best = null; for (const it of list) { const d = hav(lat, lon, it[2], it[1]); if (d <= maxKm && (!best || d < best.d)) best = { it, d }; } return best; }
function renderPattern(r) {
  const el = $("#pattern"); if (!el || st.selected !== r) return;
  if (NO_SPEC.has(r.type)) { el.innerHTML = `<div class="spec"><h4>Pattern notes</h4><p class="hint" style="margin:0">Automatic speculation is off for real crimes and missing people. Only documented theories, paired with investigators' findings, are shown above.</p></div>`; return; }
  if (!SPEC_OK.has(r.type) || r.lat == null) { el.innerHTML = ""; return; }
  const c = st.ctx, notes = [];
  const mil = nearest(c.military, r.lat, r.lon, 150);
  if (mil) notes.push(`About ${Math.round(mil.d)} km from <b>${esc(mil.it[0])}</b> (${esc(mil.it[3])}). Military aircraft, flares and classified aircraft testing are documented explanations for some sightings near bases and ranges.`);
  const ln = nearest(c.launch, r.lat, r.lon, 800);
  if (ln) notes.push(`${Math.round(ln.d)} km from the <b>${esc(ln.it[0])}</b> launch site. Rocket launches and missile tests have produced well-documented waves of "UFO" reports (glowing plumes, spirals).`);
  const ap = nearest(c.airports, r.lat, r.lon, 40);
  if (ap) notes.push(`${Math.round(ap.d)} km from <b>${esc(ap.it[0])}</b>${ap.it[4] ? " (" + esc(ap.it[4]) + ")" : ""}. Aircraft landing lights on approach are a common identified cause.`);
  const dm = r.date && r.date.length >= 10 ? r.date.slice(5).split("-").map(Number) : null;
  if (dm) for (const [name, m, d, win] of c.showers) { const a = Date.UTC(2001, dm[0] - 1, dm[1]), b = Date.UTC(2001, m - 1, d), diff = Math.abs(a - b) / 864e5; if (Math.min(diff, 365 - diff) <= win) notes.push(`The date falls in the <b>${esc(name)}</b> meteor shower window (peak ~${m}/${d}). Bright fireballs are a frequent explanation.`); }
  if (r.time) { const h = +r.time.slice(0, 2); if (h >= 19 || h <= 5) notes.push("Night-time report: bright planets (Venus, Jupiter), satellites and the ISS are common identified causes of lights."); }
  const sel = ptById(r.id);
  if (sel && sel.properties.w !== undefined) { const w = st.waves[sel.properties.w]; if (w) notes.push(`Part of a <b>report wave</b>: ${w.count} reports in the same ~200 km cell, ${esc(w.start)} → ${esc(w.end)}${w.keywords.length ? " (" + esc(w.keywords.join(", ")) + ")" : ""}. Waves can reflect one real stimulus seen by many, or media-driven reporting.`); }
  if (r.type === "cryptid") notes.push("Misidentified bears or other animals, and hoaxes, are documented explanations for some reports. BFRO classes reports by how direct the observation was.");
  if (r.type === "sound") notes.push("Industrial equipment, sonic booms from military aircraft, quarry blasts and small earthquakes are documented sources of some hums and booms.");
  el.innerHTML = `<div class="spec"><h4>Pattern notes <span class="warn">SPECULATION</span></h4><p class="hint" style="margin-top:0">Auto-generated from public context layers. These are possible explanations limited to institutions and documented programs, not findings about this case.</p><ul>${notes.map(n => `<li>${n}</li>`).join("") || "<li>No nearby bases, launch sites, airports or meteor-shower overlap found.</li>"}</ul></div>`;
}
async function renderCtx() {
  if (!map || !map.getSource("ctx")) return;
  if (!st.ctxOn.size) { map.getSource("ctx").setData({ type: "FeatureCollection", features: [] }); return; }
  const c = await ensureCtx(), feats = [];
  const add = (list, k) => list.forEach(x => feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [x[1], x[2]] }, properties: { name: x[0], k, info: x[3] || "" } }));
  if (st.ctxOn.has("military")) add(c.military, "military"); if (st.ctxOn.has("launch")) add(c.launch, "launch"); if (st.ctxOn.has("airports")) add(c.airports, "airport");
  map.getSource("ctx").setData({ type: "FeatureCollection", features: feats });
}
function renderWaves() {
  if (!map || !map.getSource("waves")) return;
  map.getSource("waves").setData({ type: "FeatureCollection", features: st.connections ? st.waves.map(w => ({ type: "Feature", geometry: { type: "Point", coordinates: [w.lon, w.lat] }, properties: { count: w.count, start: w.start, end: w.end, keywords: w.keywords.join(", "), types: Object.entries(w.types).map(([k, v]) => k + ": " + v).join(", ") } })) : [] });
}

/* ------------------------------------------------------------ community events + theories */
function credJS(f) {   // JS port of scripts/common.py credibility() for community reports
  const b = [["Baseline (innocent until disproven)", 60]], w = +f.witnesses || 0;
  if (w >= 100) b.push(["Mass sighting (100+ witnesses)", 15]); else if (w >= 10) b.push(["Many witnesses (10+)", 12]); else if (w >= 2) b.push(["Multiple witnesses", 8]);
  if (f.ev_official) b.push(["Official / military investigation (reported, unverified)", 10]);
  if (f.ev_radar) b.push(["Radar or instrument confirmation (reported)", 10]);
  if (f.ev_physical) b.push(["Physical evidence / traces (reported)", 8]);
  if (f.ev_photo || f.ev_video) b.push(["Photo, film or video exists", 5]);
  if ((f.description || "").length < 40) b.push(["Very short or vague report", -8]);
  b.push(["Single unreviewed community submission", -5]);
  return { kind: "credibility", value: Math.max(0, Math.min(100, b.reduce((a, x) => a + x[1], 0))), breakdown: b };
}
function communityRecord(c) {
  const ev = [c.witnesses ? `Witnesses reported: ${c.witnesses}` : null,
    ...["photo", "video", "radar", "physical", "official"].filter(k => c["ev_" + k]).map(k => `Submitter reports ${k === "official" ? "an official report" : k + " evidence"} (unverified)`),
    `Submitted ${new Date(c.created_at).toLocaleDateString()} by ${c.display_name || "anonymous"}`].filter(Boolean);
  return { id: "c:" + c.id, type: c.type, src: "community", community: true, title: c.title, date: c.event_date, time: c.event_time, place: c.place, lat: c.lat, lon: c.lon,
    summary: c.description, excerpts: [], evidence: ev, sources: (c.source_links || []).map(u => ({ label: u.replace(/^https?:\/\//, "").slice(0, 60), url: u })),
    license: "User-submitted; not reviewed.", score: c._score, photo: c.photo_path ? S.photoUrl(c.photo_path) : null, rumors: [] };
}
async function loadCommunity() {
  if (!S.enabled) return;
  try {
    const rows = await S.listEvents();
    st.community = (rows || []).filter(c => c.type !== "mass").map(c => ({ ...c, _score: credJS(c) }));
    st.theories = (await S.listLinks().catch(() => [])) || [];
  } catch (e) { st.community = []; }
  await applyFilters(); renderTheories();
}
function renderCommunity() {
  if (!map || !map.getSource("community")) return;
  map.getSource("community").setData({ type: "FeatureCollection", features: st.communityFiltered.map(c => ({ type: "Feature", geometry: { type: "Point", coordinates: [c.lon, c.lat] }, properties: { id: "c:" + c.id, type: c.type, n: c.title } })) });
}
function renderTheories() {
  if (!map || !map.getSource("theories")) return; const show = st.connections || st.mode === "link";
  map.getSource("theories").setData({ type: "FeatureCollection", features: show ? st.theories.map(t => ({ type: "Feature", geometry: { type: "LineString", coordinates: arcLine([t.a_lon, t.a_lat], [t.b_lon, t.b_lat], -0.12) }, properties: { label: t.label, note: t.note || "", by: t.display_name || "anonymous" } })) : [] });
}

/* ------------------------------------------------------------ modes: add event, theory link */
function setMode(mode, text) { st.mode = mode; $("#mode-bar").hidden = !mode; $("#mode-text").textContent = text || ""; if (map) map.getCanvas().style.cursor = mode ? "crosshair" : ""; renderTheories(); }
function notEnabled() { return !S.enabled || S.available === false; }
function startAddMode() {
  if (notEnabled()) { modal("Community reports aren't enabled yet", `<p>The community database hasn't been set up yet (the site owner needs to run <code>supabase-atlas.sql</code>). Everything else works normally.</p>`); return; }
  setMode("add", isPhone() ? "Tap or long-press the map to drop a pin, or search an address above" : "Click the map to drop a pin, or search an address above");
  if (isPhone()) { closeSheet("detail"); closeSheet("filters"); }
}
function startLinkMode(a) { st.linkA = a; setMode("link", `Theory Board: tap a second event to link it to “${a.title.slice(0, 40)}”`); if (isPhone()) { $("#detail").dataset.state = "closed"; navDrop(DETAIL_KEYS); } }
function rateOk() { const k = "atlas_submits", now = Date.now(); const a = JSON.parse(localStorage.getItem(k) || "[]").filter(t => now - t < 3600e3); if (a.length >= C.SUBMIT_LIMIT_PER_HOUR) return false; a.push(now); localStorage.setItem(k, JSON.stringify(a)); return true; }
function modal(title, html) {
  $("#modal-title").textContent = title; $("#modal-body").innerHTML = html; $("#modal").hidden = false;
  navPush("modal", "#" + (title.toLowerCase().match(/[a-z]+/g) || ["panel"]).slice(0, 2).join("-"), () => { $("#modal").hidden = true; });
}
function closeModal() { if ($("#modal").hidden) return; $("#modal").hidden = true; navDrop("modal"); }
async function resizePhoto(file) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const sc = Math.min(1, C.PHOTO_MAX / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); return new Promise(res => c.toBlob(res, "image/jpeg", C.PHOTO_QUALITY));
}
function openAddForm(lngLat, placeName) {
  if (notEnabled()) { toast("Community reports aren't enabled yet."); return; }
  setMode(null);
  let place = placeName || `${lngLat.lat.toFixed(4)}, ${lngLat.lng.toFixed(4)}`;
  const opts = TYPES.filter(t => t.id !== "mass").map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join("");
  modal("Add an event", `<form class="form" id="add-form" novalidate>
    <p class="hint">📍 <span id="af-place">${esc(place)}</span><br>Reports appear right away with an “Unreviewed community report” badge and are scored with the same rubric.</p>
    <label class="f" for="af-type">Type</label><select class="field" id="af-type">${opts}</select>
    <div class="row"><div><label class="f" for="af-date">Date</label><input class="field" type="date" id="af-date" max="${new Date().toISOString().slice(0, 10)}"></div><div><label class="f" for="af-time">Time</label><input class="field" type="time" id="af-time"></div></div>
    <label class="f" for="af-title">Title</label><input class="field" id="af-title" maxlength="140" placeholder="e.g. Silent orange orbs over the lake">
    <label class="f" for="af-desc">What happened? (your statement)</label><textarea class="field" id="af-desc" maxlength="4000" placeholder="What you saw or heard, how long it lasted, direction, weather…"></textarea>
    <div class="row"><div><label class="f" for="af-wit">Number of witnesses</label><input class="field" type="number" id="af-wit" min="0" max="100000" value="1"></div><div><label class="f" for="af-name">Display name (optional)</label><input class="field" id="af-name" maxlength="60" placeholder="Anonymous"></div></div>
    <label class="f">Evidence</label><div class="checks">${["photo", "video", "radar", "physical", "official"].map(k => `<label class="chk"><input type="checkbox" id="af-${k}"> ${k === "official" ? "Official report" : k[0].toUpperCase() + k.slice(1)}</label>`).join("")}</div>
    <label class="f" for="af-file">Photo (optional, resized to ${C.PHOTO_MAX}px)</label><input class="field" type="file" id="af-file" accept="image/*" style="padding-top:8px">
    <label class="f" for="af-links">Source links (optional, one per line, max 5)</label><textarea class="field" id="af-links" style="min-height:60px" placeholder="https://…"></textarea>
    <div class="hp" aria-hidden="true"><label>Website<input id="af-website" tabindex="-1" autocomplete="off"></label></div>
    <p class="hint">Please don't name or accuse private individuals. The moderator can hide posts.</p>
    <div id="af-err" class="err" role="alert"></div><button class="btn wide" type="submit" id="af-submit">Submit report</button></form>`);
  if (!placeName) fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=12&lat=${lngLat.lat}&lon=${lngLat.lng}`).then(r => r.json()).then(j => { if (j && j.display_name) { place = j.display_name.split(",").slice(0, 3).join(","); const el = $("#af-place"); if (el) el.textContent = place; } }).catch(() => {});
  $("#add-form").onsubmit = async ev => {
    ev.preventDefault(); const err = $("#af-err"); err.textContent = "";
    const title = $("#af-title").value.trim(); if (title.length < 3) { err.textContent = "Please add a short title."; return; }
    if (!rateOk()) { err.textContent = "You've submitted several reports recently. Please try again in an hour."; return; }
    const btn = $("#af-submit"); btn.disabled = true; btn.textContent = "Submitting…";
    try {
      let photo_path = null; const file = $("#af-file").files[0];
      if (file) photo_path = await S.uploadPhoto(await resizePhoto(file));
      const p = { type: $("#af-type").value, title, description: $("#af-desc").value.trim(), event_date: $("#af-date").value || null, event_time: $("#af-time").value || null,
        lat: +lngLat.lat.toFixed(5), lon: +lngLat.lng.toFixed(5), place, witnesses: +$("#af-wit").value || 1, display_name: $("#af-name").value.trim(), photo_path,
        source_links: $("#af-links").value.split(/\s+/).filter(u => /^https?:\/\//.test(u)).slice(0, 5), website: $("#af-website").value,
        ev_photo: $("#af-photo").checked, ev_video: $("#af-video").checked, ev_radar: $("#af-radar").checked, ev_physical: $("#af-physical").checked, ev_official: $("#af-official").checked };
      const id = await S.submitEvent(p);
      const row = { ...p, id, created_at: new Date().toISOString() }; row._score = credJS(row); st.community.unshift(row);
      closeModal(); await applyFilters(); toast("Thanks! Your report is on the map (unreviewed)."); selectEvent("c:" + id);
    } catch (e) { err.textContent = S.available === false ? "Community reports aren't enabled on the server yet." : (e.message || "Submission failed."); btn.disabled = false; btn.textContent = "Submit report"; }
  };
}
function openTheoryForm(a, b) {
  setMode(null); st.linkA = null;
  if (notEnabled()) { modal("Theory Board isn't enabled yet", "<p>The community database hasn't been set up yet.</p>"); return; }
  modal("Draw a theory line", `<form class="form" id="th-form"><p class="hint">Linking <b>${esc(a.title)}</b> ↔ <b>${esc(b.title)}</b>. It will be shown as a dashed line labeled “Community theory, speculation”.</p>
   <label class="f" for="th-label">Label</label><input class="field" id="th-label" maxlength="80" placeholder="e.g. Same triangle craft?">
   <label class="f" for="th-note">Note</label><textarea class="field" id="th-note" maxlength="1000" placeholder="Why do you think these are connected?"></textarea>
   <label class="f" for="th-name">Display name (optional)</label><input class="field" id="th-name" maxlength="60">
   <div class="hp" aria-hidden="true"><input id="th-website" tabindex="-1" autocomplete="off"></div>
   <p class="hint">Theories about real crimes or missing people must not accuse or name private individuals.</p><div id="th-err" class="err"></div><button class="btn wide" type="submit">Save theory</button></form>`);
  $("#th-form").onsubmit = async ev => {
    ev.preventDefault(); const label = $("#th-label").value.trim(); if (label.length < 2) { $("#th-err").textContent = "Add a label."; return; }
    if (!rateOk()) { $("#th-err").textContent = "Too many submissions this hour."; return; }
    try {
      const p = { a_id: a.id, b_id: b.id, a_lat: a.lat, a_lon: a.lon, b_lat: b.lat, b_lon: b.lon, label, note: $("#th-note").value.trim(), display_name: $("#th-name").value.trim(), website: $("#th-website").value };
      const id = await S.submitLink(p); st.theories.unshift({ ...p, id, created_at: new Date().toISOString() });
      closeModal(); st.connections = true; syncConnBtn(); renderTheories(); renderWaves(); toast("Theory saved (shown as community speculation).");
    } catch (e) { $("#th-err").textContent = e.message || "Failed."; }
  };
}

/* ------------------------------------------------------------ search / fly to */
function hideMenu() { const m = $("#more-menu"); if (m.hidden) return; m.hidden = true; navDrop("menu"); }
function hideSearch() { const b = $("#search-results"); if (b.hidden) return; b.hidden = true; navDrop("search"); }
let geoLast = 0;
async function doSearch(q) {
  const box = $("#search-results"); q = q.trim(); if (!q) { hideSearch(); return; }
  const ql = q.toLowerCase(), hits = [];
  for (const t of TYPES) { const arr = st.pts[t.id]; if (!arr) continue; for (const f of arr) if (f.properties.c && f.properties.n.toLowerCase().includes(ql)) hits.push(f); }
  for (const t of TYPES) { const arr = st.pts[t.id]; if (!arr || hits.length >= 8) continue; for (const f of arr) { if (!f.properties.c && f.properties.n.toLowerCase().includes(ql)) { hits.push(f); if (hits.length >= 8) break; } } }
  let html = hits.length ? `<div class="sr-h">Events</div>` + hits.slice(0, 8).map(f => `<button type="button" data-id="${esc(f.properties.i)}">${shapeSVG(TYPES[f.properties.t], 12)} ${esc(f.properties.n)}</button>`).join("") : "";
  html += `<div class="sr-h">Fly to a place</div><div id="sr-places"><button type="button" disabled>Searching places…</button></div>`;
  box.innerHTML = html; if (box.hidden) { box.hidden = false; navPush("search", "#search", () => { box.hidden = true; }); }
  box.querySelectorAll("button[data-id]").forEach(b => b.onclick = () => { hideSearch(); selectEvent(b.dataset.id, { fly: true, zoom: 8 }); });
  const wait = Math.max(0, 1100 - (Date.now() - geoLast)); await new Promise(r => setTimeout(r, wait)); geoLast = Date.now();
  try {
    const res = await (await fetch(`${C.GEOCODER}?format=json&limit=5&q=${encodeURIComponent(q)}`, { headers: { "Accept-Language": "en" } })).json();
    const pl = $("#sr-places"); if (!pl) return;
    pl.innerHTML = res.length ? res.map((r, i) => `<button type="button" data-i="${i}">📍 ${esc(r.display_name)}</button>`).join("") : `<button type="button" disabled>No places found</button>`;
    pl.querySelectorAll("button[data-i]").forEach(b => b.onclick = () => {
      const r = res[+b.dataset.i]; hideSearch(); const bb = r.boundingbox.map(Number);
      if (st.mode === "add") { map.flyTo({ center: [+r.lon, +r.lat], zoom: 14 }); openAddForm({ lng: +r.lon, lat: +r.lat }, r.display_name.split(",").slice(0, 3).join(",")); }
      else map.fitBounds([[bb[2], bb[0]], [bb[3], bb[1]]], { maxZoom: 16, padding: 40, duration: 2400 });
    });
  } catch (e) { const pl = $("#sr-places"); if (pl) pl.innerHTML = `<button type="button" disabled>Place search unavailable</button>`; }
}

/* ------------------------------------------------------------ visitors (city-level only) */
async function countVisit() {
  if (!S.enabled) return; const k = "atlas_visit_day", today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem(k) === today) return;
  let g = null;
  for (const u of C.IPGEO) {
    try { const j = await (await fetch(u)).json(); const lat = +j.latitude, lon = +j.longitude;
      g = { city: j.city || "", region: j.region || "", country: j.country || j.country_name || j.country_code || "", lat: isFinite(lat) ? Math.round(lat * 100) / 100 : null, lon: isFinite(lon) ? Math.round(lon * 100) / 100 : null };
      if (g.country || g.city) break; } catch (e) {}
  }
  if (!g) return;
  try { await S.visit(g); localStorage.setItem(k, today); } catch (e) {}
}
async function openVisitors() {
  modal("Visitors", `<p class="hint">Loading…</p>`);
  try {
    const v = await S.visitors(); st.visitors = v;
    $("#modal-body").innerHTML = `<div class="big-n">${fmtN(+v.total || 0)}</div><p class="hint">visits (counted once per device per day) from ${fmtN(+v.cities || 0)} cities</p>
     <h3>Top cities</h3>${(v.top || []).slice(0, 25).map((c, i) => `<div class="kv"><span>${i + 1}. ${esc([c.city, c.region, c.country].filter(Boolean).join(", ") || "Unknown")}</span><b>${fmtN(+c.visits)}</b></div>`).join("") || "<p class='hint'>No visits yet.</p>"}
     <label class="chk" style="margin-top:12px"><input type="checkbox" id="vis-layer" ${st.visitorsOn ? "checked" : ""}> Show visitor cities on the globe</label>
     <p class="hint">Privacy: your browser looks up an approximate city with a keyless IP-geolocation service; only that city/region/country and rounded coordinates are counted. No IP addresses or personal data are stored.</p>`;
    $("#vis-layer").onchange = e => { st.visitorsOn = e.target.checked; $("#chk-visitors").checked = st.visitorsOn; renderVisitors(); };
  } catch (e) { $("#modal-body").innerHTML = `<p>${notEnabled() ? "The visitor counter isn't set up on the server yet." : "Couldn't load visitor stats right now."}</p>`; }
}
async function renderVisitors() {
  if (!map || !map.getSource("visitors")) return;
  if (!st.visitorsOn) { map.getSource("visitors").setData({ type: "FeatureCollection", features: [] }); return; }
  try { if (!st.visitors) st.visitors = await S.visitors(); } catch (e) { toast("Visitor stats unavailable."); return; }
  map.getSource("visitors").setData({ type: "FeatureCollection", features: (st.visitors.top || []).filter(c => c.lat != null && c.lon != null).map(c => ({ type: "Feature", geometry: { type: "Point", coordinates: [+c.lon, +c.lat] }, properties: { visits: +c.visits, name: [c.city, c.country].filter(Boolean).join(", ") } })) });
}

/* ------------------------------------------------------------ admin (passcode checked server-side) */
function openAdmin() {
  modal("Moderator", `<form class="form" id="adm-form"><label class="f" for="adm-p">Admin passcode</label><input class="field" type="password" id="adm-p" autocomplete="current-password"><div id="adm-err" class="err"></div><button class="btn wide">Unlock</button></form><div id="adm-list"></div>`);
  $("#adm-form").onsubmit = async e => {
    e.preventDefault(); const p = $("#adm-p").value;
    try { if (!(await S.adminVerify(p))) throw new Error("Wrong passcode"); st.admin = p; await renderAdminList(); $("#adm-form").hidden = true; }
    catch (er) { $("#adm-err").textContent = notEnabled() ? "Server not set up yet." : er.message; }
  };
}
async function renderAdminList() {
  const d = await S.adminList(st.admin);
  const row = (k, x) => `<div class="kv"><span>${x.is_hidden ? "🚫 " : ""}<b>${esc(x.title || x.label)}</b><br><small>${esc(x.type || "theory")} · ${esc(x.display_name || "anon")} · ${esc(new Date(x.created_at).toLocaleString())}</small></span><button class="btn small ${x.is_hidden ? "ghost" : "danger"}" data-k="${k}" data-id="${esc(x.id)}" data-h="${!x.is_hidden}">${x.is_hidden ? "Unhide" : "Hide"}</button></div>`;
  $("#adm-list").innerHTML = `<h3>Community events</h3>${(d.events || []).map(x => row("event", x)).join("") || "<p class='hint'>None</p>"}<h3>Theories</h3>${(d.links || []).map(x => row("link", x)).join("") || "<p class='hint'>None</p>"}`;
  $("#adm-list").querySelectorAll("button[data-id]").forEach(b => b.onclick = async () => { await S.adminSetHidden(st.admin, b.dataset.k, b.dataset.id, b.dataset.h === "true"); await renderAdminList(); loadCommunity(); });
}

/* ------------------------------------------------------------ about */
function openAbout() {
  const m = st.manifest;
  modal("About Anomaly Atlas", `<p>A zoomable globe of ${fmtN(m.total)} reported unexplained events from public sources, each with a transparent score.</p>
   <h3>Credibility score (0–100)</h3><p class="hint">Innocent until proven guilty: every event starts at <b>60</b>. Evidence that it was false weighs heavily: hoax −50, disproven −45, identified/explained −35, probable conventional explanation −20, partly explained −12, disputed explanation −5. Boosts: multiple witnesses +8 (10+: +12, 100+: +15), official/military investigation +10, radar/instruments +10, physical evidence +8, photo/video +5, credible witness type (pilot, police, military, scientist) +8, recurring phenomenon +8, BFRO Class A +5. Penalties: BFRO Class C −10, very short/vague report −8, unreviewed single community submission −5.</p>
   <h3>Unanswered-questions score (mass events only)</h3><p class="hint">Scores the <b>why</b>, never whether it happened: motive undetermined +45, partly established +25, established +5; investigation closed without a motive +20, unsolved +25, open +15, closed with clear findings 0; +10 per documented open question from official or reputable sources (max +30). Rumors never change it.</p>
   <h3>Sources</h3>${Object.values(m.sources).map(s => `<div class="kv"><span><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a><br><small>${esc(s.license)}</small></span><b>${fmtN(Object.values(m.counts_by_source[s.id] || {}).reduce((a, b) => a + b, 0))}</b></div>`).join("")}
   <p class="hint">Context layers: US DoD MIRTA sites via HIFLD Open (public domain), OurAirports (public domain), launch sites (Wikipedia), meteor showers (IMO calendar). Basemaps © OpenStreetMap contributors via OpenFreeMap; Realistic Earth imagery: NASA Blue Marble Next Generation (NASA Earth Observatory, public domain), self-hosted; satellite imagery: Sentinel-2 cloudless 2016 by EOX (CC BY 4.0). City labels: GeoNames cities500 (CC BY 4.0). Place search: OSM Nominatim.</p>
   <p class="hint">Data built ${esc(m.built)} · ${esc(C.VERSION)}</p>`);
}

/* ------------------------------------------------------------ UI wiring */
function syncConnBtn() { $("#btn-connections").setAttribute("aria-pressed", st.connections); }
function wireDual(id, key, out, fmt) {
  const [a, b] = $$(`#${id} input`);
  const upd = () => { let x = +a.value, y = +b.value; if (x > y) [x, y] = [y, x]; st[key] = [x, y]; $(out).textContent = fmt(x, y); scheduleFilter(); };
  a.oninput = b.oninput = upd; $(out).textContent = fmt(+a.value, +b.value);
}
function wireUI() {
  $("#btn-filters").onclick = () => $("#filters").dataset.state === "closed" ? openFilters() : closeSheet("filters");
  $$("[data-close]").forEach(b => b.onclick = () => closeSheet(b.dataset.close));
  $("#type-list").onclick = e => { const b = e.target.closest("button[data-type]"); if (!b) return; const t = b.dataset.type;
    if (t === "community") st.community_on = !st.community_on; else st.enabled.has(t) ? st.enabled.delete(t) : st.enabled.add(t);
    renderTypeList(); scheduleFilter(); };
  $("#q").oninput = e => { st.q = e.target.value; scheduleFilter(); };
  wireDual("cred-range", "cred", "#cred-out", (a, b) => `${a}–${b}`);
  wireDual("uq-range", "uq", "#uq-out", (a, b) => `${a}–${b}`);
  $("#outcome-chips").onclick = e => { const b = e.target.closest("[data-oc]"); if (!b) return; const k = b.dataset.oc; st.outcomes.has(k) ? st.outcomes.delete(k) : st.outcomes.add(k); applyFilters(); };
  $("#m411-toggle").onchange = e => { st.m411 = e.target.checked; applyFilters(); };
  wireDual("date-range", "years", "#date-out", (a, b) => `${a}–${b}`);
  $("#chk-undated").onchange = e => { st.undated = e.target.checked; scheduleFilter(); };
  const reconn = () => { if (st.selected) { computeArcs(st.selected); renderArcs(); renderDetailLinks(st.selected); } };
  $("#chk-autoconnect").onchange = e => { st.autoconnect = e.target.checked; reconn(); };
  $("#conn-days").oninput = e => { st.days = +e.target.value; $("#conn-days-out").textContent = st.days + (st.days === 1 ? " day" : " days"); clearTimeout(reconn._t); reconn._t = setTimeout(reconn, 150); };
  $("#conn-km").oninput = e => { st.km = +e.target.value; $("#conn-km-out").textContent = st.km + " km"; clearTimeout(reconn._t); reconn._t = setTimeout(reconn, 150); };
  $("#btn-reset").onclick = () => {
    st.enabled = new Set(TYPES.filter(t => t.id !== "mass").map(t => t.id)); st.community_on = true; st.q = ""; $("#q").value = ""; st.undated = true; $("#chk-undated").checked = true;
    [["cred-range", 0, 100], ["uq-range", 0, 100], ["date-range", 1000, 2026]].forEach(([id, a, b]) => { const [x, y] = $$(`#${id} input`); x.value = a; y.value = b; x.oninput(); });
  };
  $("#btn-connections").onclick = () => { st.connections = !st.connections; syncConnBtn(); renderWaves(); renderTheories(); renderArcs(); toast(st.connections ? "Connections on: report waves (yellow rings), curated links and community theories" : "Connections off"); };
  $("#btn-add").onclick = startAddMode;
  $("#mode-cancel").onclick = () => { st.linkA = null; setMode(null); };
  $("#btn-more").onclick = e => { e.stopPropagation(); if ($("#more-menu").hidden) { $("#more-menu").hidden = false; navPush("menu", "#menu", () => { $("#more-menu").hidden = true; }); } else hideMenu(); };
  document.addEventListener("click", e => { if (!e.target.closest("#more-menu") && !e.target.closest("#btn-more")) hideMenu(); if (!e.target.closest("#search-form")) hideSearch(); });
  $("#style-seg").innerHTML = Object.entries(C.STYLES).map(([k, s]) => `<button type="button" data-style="${k}" class="${k === st.style ? "on" : ""}">${s.label}</button>`).join("");
  $("#style-seg").onclick = e => { const b = e.target.closest("button[data-style]"); if (!b || b.dataset.style === st.style) return; st.style = b.dataset.style; $$("#style-seg button").forEach(x => x.classList.toggle("on", x === b)); clearDonuts(); styleFor(st.style).then(sty => map.setStyle(sty)); };
  $$("[data-ctx]").forEach(c => c.onchange = () => { c.checked ? st.ctxOn.add(c.dataset.ctx) : st.ctxOn.delete(c.dataset.ctx); renderCtx(); });
  $("#chk-visitors").onchange = e => { st.visitorsOn = e.target.checked; renderVisitors(); };
  $("#btn-visitors").onclick = () => { hideMenu(); openVisitors(); };
  $("#btn-about").onclick = $("#foot-about").onclick = e => { e.preventDefault(); hideMenu(); openAbout(); };
  $("#btn-admin").onclick = () => { hideMenu(); openAdmin(); };
  $("#modal-x").onclick = closeModal; $("#modal").onclick = e => { if (e.target.id === "modal") closeModal(); };
  document.addEventListener("keydown", e => { if (e.key === "Escape") { if (!$("#modal").hidden) closeModal(); else if (st.mode) setMode(null); else closeSheet("detail"); } });
  let sT; $("#search").oninput = e => { clearTimeout(sT); const v = e.target.value; sT = setTimeout(() => v.length >= 3 && doSearch(v), 900); };
  $("#search-form").onsubmit = e => { e.preventDefault(); clearTimeout(sT); doSearch($("#search").value); };
  $("#legend-chip").innerHTML = TYPES.filter(t => t.id !== "mass").map(t => `<span>${shapeSVG(t, 12)}${esc(t.label.replace(" sighting", "").replace(" (unexplained)", ""))}</span>`).join("") + `<span>${shapeSVG(null, 12, true)}Community</span>`;
  wireSheets();
}
function wireSheets() {   // drag handle for phone bottom sheets
  for (const el of $$(".sheet")) {
    const h = el.querySelector(".sheet-handle"), head = el.querySelector(".panel-head"); let y0 = null, st0;
    h.addEventListener("click", () => { el.dataset.state = el.dataset.state === "full" ? "half" : "full"; });
    for (const g of [h, head]) {
      g.addEventListener("touchstart", e => { if (e.target.closest("button")) return; y0 = e.touches[0].clientY; st0 = el.dataset.state; el.style.transition = "none"; }, { passive: true });
      g.addEventListener("touchmove", e => { if (y0 == null) return; const dy = e.touches[0].clientY - y0, base = st0 === "full" ? 0 : el.offsetHeight - innerHeight * 0.52; el.style.transform = `translateY(${Math.max(0, base + dy)}px)`; }, { passive: true });
      g.addEventListener("touchend", e => { if (y0 == null) return; const dy = e.changedTouches[0].clientY - y0; el.style.transition = ""; el.style.transform = ""; y0 = null;
        if (dy > 80) { if (st0 === "full") el.dataset.state = "half"; else closeSheet(el.id); } else if (dy < -60) el.dataset.state = "full"; });
    }
  }
}
function wireMapEvents() {
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: "300px", offset: 10 });
  let handled = 0; const mark = () => handled = Date.now(), was = () => Date.now() - handled < 50;
  map.on("click", "spider-pts", e => { mark(); selectEvent(e.features[0].properties.i); });
  map.on("click", "pts", e => { if (was()) return; mark(); selectEvent(e.features[0].properties.i); });
  map.on("click", "stacks", e => { if (was()) return; mark(); openStack(e.features[0].properties.i); });
  map.on("click", e => { if (!was() && st.spider) setTimeout(() => { if (!was()) unspiderfy(); }, 0); });
  ["zoomstart", "rotatestart", "pitchstart"].forEach(ev => map.on(ev, () => unspiderfy()));
  map.on("click", "community", e => { mark(); selectEvent(e.features[0].properties.id); });
  map.on("click", "clusters", async e => {
    if (was()) return; mark(); const f = e.features[0];
    try { const z = await map.getSource("events").getClusterExpansionZoom(f.properties.cluster_id); map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(z + 0.3, 18), duration: 900 }); } catch (er) {}
  });
  map.on("click", "waves", e => { if (was()) return; const w = e.features[0].properties; new maplibregl.Popup({ maxWidth: "300px" }).setLngLat(e.lngLat).setHTML(`<div class="why"><b>Report wave</b><br>${w.count} reports, ${esc(w.start)} → ${esc(w.end)}<br>${esc(w.types)}${w.keywords ? "<br>Keywords: " + esc(w.keywords) : ""}</div>`).addTo(map); });
  const hoverWhy = (e, title) => { const p = e.features[0].properties; popup.setLngLat(e.lngLat).setHTML(`<div class="why"><b>${title}</b> ${esc(p.n || p.label || "")}<ul>${(p.why || p.note || "").split(" · ").filter(Boolean).map(x => `<li>${esc(x)}</li>`).join("")}</ul>${p.by ? `<small>by ${esc(p.by)} · Community theory, speculation</small>` : ""}</div>`).addTo(map); };
  map.on("mousemove", "arcs-hit", e => { map.getCanvas().style.cursor = "help"; hoverWhy(e, "Why linked:"); });
  map.on("mouseleave", "arcs-hit", () => { map.getCanvas().style.cursor = ""; popup.remove(); });
  map.on("mousemove", "theories-hit", e => hoverWhy(e, "💭 Community theory, speculation:"));
  map.on("mouseleave", "theories-hit", () => popup.remove());
  map.on("click", "arcs-hit", e => { if (was()) return; mark(); hoverWhy(e, "Why linked:"); setTimeout(() => popup.remove(), 6000); });
  map.on("click", "theories-hit", e => { if (was()) return; mark(); hoverWhy(e, "💭 Community theory, speculation:"); setTimeout(() => popup.remove(), 8000); });
  map.on("click", "ctx-pts", e => { if (was()) return; mark(); const p = e.features[0].properties; new maplibregl.Popup().setLngLat(e.lngLat).setHTML(`<b>${esc(p.name)}</b><br><small>${esc(p.k)}${p.info ? " · " + esc(p.info) : ""}</small>`).addTo(map); });
  ["clusters", "stacks", "spider-pts", "pts", "community", "waves", "ctx-pts"].forEach(l => { map.on("mouseenter", l, () => { if (!st.mode) map.getCanvas().style.cursor = "pointer"; }); map.on("mouseleave", l, () => { if (!st.mode) map.getCanvas().style.cursor = ""; }); });
  map.on("click", e => { setTimeout(() => { if (st.mode === "add" && !was()) openAddForm(e.lngLat); }, 0); });
  map.on("contextmenu", e => { if (!notEnabled()) openAddForm(e.lngLat); });
  let lp; map.on("touchstart", e => { if (!e.originalEvent.touches || e.originalEvent.touches.length !== 1) return; const ll = e.lngLat; lp = setTimeout(() => { if (notEnabled()) return toast("Community reports aren't enabled yet."); if (navigator.vibrate) navigator.vibrate(30); openAddForm(ll); }, 650); });
  ["touchend", "touchmove", "dragstart", "zoomstart", "rotatestart"].forEach(ev => map.on(ev, () => clearTimeout(lp)));
}

/* ------------------------------------------------------------ boot */
async function boot() {
  window.addEventListener("error", e => window.Atlas.errors.push(String(e.message)));
  window.addEventListener("unhandledrejection", e => window.Atlas.errors.push("unhandled: " + String(e.reason && e.reason.message || e.reason)));
  try {
    const stylePromise = styleFor(st.style);   // fetch the basemap style while data loads
    st.manifest = await getJSON(`data/manifest.json${V}`);
    wireUI(); renderTypeList();
    $("#loading-text").textContent = `Loading ${fmtN(st.manifest.total)} events…`;
    const [w, l] = await Promise.all([getJSON(`data/waves.json${V}`), getJSON(`data/links.json${V}`)]); st.waves = w; st.links = l;
    await Promise.all(["sound", "phenomenon", "disappearance", "other", "mass", "cryptid", "bluebook"].map(loadType)); await applyFilters();
    await initMap(stylePromise);
    await new Promise(r => map.loaded() ? r() : map.once("load", r));
    $("#loading").classList.add("done");
    await loadType("ufo"); await applyFilters();
    loadCities();
    window.Atlas.ready = true;
    const m = location.hash.match(/#(?:event|e)=([^&]+)/);
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);   // base entry = bare globe, so Back from the deep-linked popup stays on the site
    if (m) { const id = decodeURIComponent(m[1]); const [t] = splitId(id); if (TI[t] !== undefined) { await loadType(t); if (t === "mass") { st.enabled.add("mass"); await applyFilters(); } } selectEvent(id, { fly: true }); }
    else if (!isPhone()) openSheet("filters");
    loadCommunity(); countVisit();
  } catch (e) { console.error(e); window.Atlas.errors.push(String(e)); $("#loading-text").textContent = "Couldn't load the atlas data. Please refresh."; }
}
window.Atlas.selectEvent = (id, o) => selectEvent(id, o);
window.Atlas.applyFilters = () => applyFilters();
window.Atlas.openStack = id => openStack(id);
boot();
})();
