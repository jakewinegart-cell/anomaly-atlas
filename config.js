// ===== Anomaly Atlas — configuration =====
window.ATLAS_CONFIG = {
  VERSION: "atlas3",
  // Supabase (shared with the family-recipes project; Atlas only uses atlas_* tables/RPCs + the atlas-photos bucket).
  // The publishable key is meant to be public. Leave SUPABASE_URL blank to run fully offline (no community features).
  SUPABASE_URL: "https://pcxmlmhwlyaqabaujoxa.supabase.co",
  SUPABASE_KEY: "sb_publishable_bDkcJrBaiLtKr4QPKtmb7g_7VO0pVNp",
  // Admin passcode is NEVER stored here: it is checked server-side (atlas_admin_verify, bcrypt).

  // Basemaps (no API keys). OpenFreeMap vector styles (OSM data) + EOX Sentinel-2 cloudless 2016 (CC BY 4.0) imagery.
  STYLES: {
    // Realistic (default): local NASA Blue Marble tiles (z0-6) under OpenFreeMap borders/labels; fades into the OSM street map from z6-8.
    realistic: { label: "Realistic", vector: "https://tiles.openfreemap.org/styles/liberty" },
    satellite: { label: "Satellite", raster: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg", maxzoom: 14,
      attribution: '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2016 &amp; 2017), CC BY 4.0' },
    dark: { label: "Dark", url: "https://tiles.openfreemap.org/styles/dark" }
  },
  // Self-hosted NASA Blue Marble Next Generation (Dec 2004, topography + bathymetry). Public domain; credit NASA Earth Observatory.
  BLUE_MARBLE: { tiles: "data/tiles/bm/{z}/{x}/{y}.webp", maxzoom: 6,
    attribution: '<a href="https://earthobservatory.nasa.gov/features/BlueMarble" target="_blank" rel="noopener">NASA Blue Marble</a> (public domain)' },
  GLYPHS: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  FONT: ["Noto Sans Regular"],
  // Place search (Fly to): OSM Nominatim, used only on submit (<=1 req/s per usage policy).
  GEOCODER: "https://nominatim.openstreetmap.org/search",
  // Visitor city lookup (keyless). Only city/region/country + coords rounded to 0.01 deg are sent to Supabase.
  IPGEO: ["https://get.geojs.io/v1/ip/geo.json", "https://ipapi.co/json/"],
  PHOTO_MAX: 1600, PHOTO_QUALITY: 0.82,
  SUBMIT_LIMIT_PER_HOUR: 3
};
