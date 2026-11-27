/*!
 * Round Sensor Card for Home Assistant
 * MIT License. Independent implementation; no code from other cards.
 * A circular gauge for one sensor value, usable as a dashboard card or as an element of a picture-elements card.
 */
const CARD_VERSION = "1.0.0";
// Reserved for a future optional supporter tier. Nothing is gated today.
const PRO_ENABLED = false;

const DEFAULTS = { min: 0, max: 100, stroke_width: 6, stroke_color: "#03a9f4", stroke_bg_color: "#999999", fill: "transparent", show_card: false };
const FONT_PROPS = ["color", "font-size", "font-family", "font-weight", "font-style", "text-shadow", "letter-spacing", "text-transform"];
const R = 44;
const CIRC = 2 * Math.PI * R;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
// Values reach style.setProperty only, but still refuse anything that could smuggle another declaration or a url.
const safeCss = (v) => (typeof v === "string" && /^[#\w\s(),.%'"\-]+$/.test(v) && !/url\s*\(|expression|javascript/i.test(v) ? v : "");

function parseHex(c) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c).trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
const toHex = (a) => "#" + a.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");

export function stopsFrom(obj) {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj).map(([k, v]) => [num(k), safeCss(v)]).filter(([k, v]) => k !== null && v).sort((a, b) => a[0] - b[0]);
}
// Step mode: the lowest stop whose value is at or above the reading; past the last stop, the last color.
// Gradient mode: linear blend between neighbouring stops when both colors are hex, otherwise falls back to step.
export function colorFor(value, stops, gradient, fallback) {
  if (!stops.length || value === null) return fallback;
  if (gradient) {
    if (value <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      const [v1, c1] = stops[i], [v0, c0] = stops[i - 1];
      if (value <= v1) {
        const a = parseHex(c0), b = parseHex(c1);
        if (!a || !b) break;
        const t = v1 === v0 ? 1 : (value - v0) / (v1 - v0);
        return toHex(a.map((x, j) => x + (b[j] - x) * t));
      }
    }
  }
  for (const [v, c] of stops) if (value <= v) return c;
  return stops[stops.length - 1][1];
}

const CSS = `
:host{display:block;width:100px}
:host(.rsc-card){width:auto}
ha-card{display:block;padding:12px;text-align:center}
.box{display:block;width:100%;height:100%}
ha-card .box{width:100%;max-width:170px;height:auto;margin:0 auto}
.box.tap{cursor:pointer}
.box:focus-visible{outline:2px solid var(--primary-color,#03a9f4);outline-offset:2px;border-radius:50%}
svg{display:block;width:100%;height:100%;overflow:visible}
text{text-anchor:middle;fill:var(--primary-text-color,#212121);font-family:inherit}
.name{font-size:11px;fill:var(--secondary-text-color,#727272)}
.val{font-size:22px;font-weight:500}
.unit{font-size:10px}
.max{font-size:9px;fill:var(--secondary-text-color,#727272)}
.empty{padding:12px;font-size:12px;opacity:.7}
`;

export class RoundSensorCard extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  static getConfigElement() { return document.createElement("round-sensor-card-editor"); }
  static getStubConfig(hass) {
    const e = hass && Object.keys(hass.states || {}).find((k) => k.startsWith("sensor.") && num(hass.states[k].state) !== null);
    return { entity: e || "sensor.example", show_card: true };
  }
  setConfig(config) {
    if (!config || typeof config !== "object") throw new Error("Invalid configuration");
    if (typeof config.entity !== "string" || !config.entity.includes(".")) throw new Error("Please define an entity");
    this._config = { ...DEFAULTS, ...config };
    this.classList.toggle("rsc-card", !!this._config.show_card);
    this._render();
  }
  set hass(h) { this._hass = h; this._render(); }
  get hass() { return this._hass; }
  getCardSize() { return this._config && this._config.show_card ? 3 : 1; }
  _read() {
    const c = this._config, st = this._hass.states[c.entity];
    const raw = c.attribute ? st.attributes[c.attribute] : st.state;
    const value = num(raw);
    const maxAttr = c.attribute_max ? num(st.attributes[c.attribute_max]) : null;
    const min = num(c.min) ?? 0;
    const max = maxAttr ?? num(c.max) ?? 100;
    return { st, raw, value, min, max };
  }
  _text(value) {
    const d = num(this._config.decimals);
    if (value === null) return "–";
    return d !== null && d >= 0 && d <= 10 ? value.toFixed(d) : String(Math.round(value * 100) / 100);
  }
  _render() {
    const c = this._config, h = this._hass;
    if (!c || !h) return;
    const st = h.states[c.entity];
    if (!st) {
      this.shadowRoot.innerHTML = `<style>${CSS}</style><ha-card><div class="empty">Entity not found: ${esc(c.entity)}</div></ha-card>`;
      return;
    }
    const { value, min, max } = this._read();
    const span = max - min;
    const pct = value === null || !(span > 0) ? 0 : Math.min(1, Math.max(0, (value - min) / span));
    const stops = stopsFrom(c.color_stops);
    const color = safeCss(colorFor(value, stops, !!c.gradient, safeCss(c.stroke_color) || DEFAULTS.stroke_color));
    const sw = Math.min(20, Math.max(1, num(c.stroke_width) ?? 6));
    const bgw = Math.min(20, Math.max(1, num(c.stroke_bg_width) ?? sw));
    const unit = c.units !== undefined && c.units !== null ? String(c.units).trim() : String(st.attributes.unit_of_measurement || "");
    const name = c.name === undefined ? "" : String(c.name);
    const vtext = this._text(value);
    const label = [name || st.attributes.friendly_name || c.entity, vtext + (unit ? ` ${unit}` : "")].join(": ");
    const tap = !c.tap_action || c.tap_action.action !== "none";
    const showMax = !!c.show_max && value !== null;
    const cy = name ? 54 : 52;
    this.shadowRoot.innerHTML = `<style>${CSS}</style>${c.show_card ? "<ha-card>" : ""}<div class="box${tap ? " tap" : ""}"${tap ? ' tabindex="0" role="button"' : ' role="img"'} aria-label="${esc(label)}">
<svg viewBox="0 0 100 100" aria-hidden="true">
<circle class="face" cx="50" cy="50" r="${R}"></circle>
<circle class="track" cx="50" cy="50" r="${R}" fill="none" stroke-width="${bgw}"></circle>
<circle class="arc" cx="50" cy="50" r="${R}" fill="none" stroke-width="${sw}" stroke-linecap="butt" stroke-dasharray="${(CIRC * pct).toFixed(2)} ${CIRC.toFixed(2)}" transform="rotate(-90 50 50)"></circle>
${name ? `<text class="name" x="50" y="34">${esc(name)}</text>` : ""}
<text class="val" x="50" y="${cy}">${esc(vtext)}${unit ? `<tspan class="unit" dx="1">${esc(unit)}</tspan>` : ""}</text>
${showMax ? `<text class="max" x="50" y="${cy + 14}">/ ${esc(this._text(max))}</text>` : ""}
</svg></div>${c.show_card ? "</ha-card>" : ""}`;
    const root = this.shadowRoot;
    const set = (sel, prop, val) => { const el = root.querySelector(sel); if (el && val) el.style.setProperty(prop, val); };
    set(".face", "fill", safeCss(c.fill));
    set(".track", "stroke", safeCss(c.stroke_bg_color));
    set(".arc", "stroke", color);
    const vt = root.querySelector(".val");
    const fs = c.font_style && typeof c.font_style === "object" ? c.font_style : {};
    for (const p of FONT_PROPS) {
      const v = safeCss(fs[p]);
      if (v && vt) vt.style.setProperty(p === "color" ? "fill" : p, v);
    }
    if (tap) {
      const box = root.querySelector(".box");
      box.addEventListener("click", () => this._action());
      box.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); this._action(); } });
    }
  }
  _action() {
    const c = this._config, h = this._hass;
    const a = c.tap_action || { action: "more-info" };
    switch (a.action || "more-info") {
      case "none": return;
      case "navigate":
        if (!a.navigation_path) return;
        window.history.pushState(null, "", a.navigation_path);
        window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
        return;
      case "url":
        if (a.url_path && /^https?:\/\//i.test(a.url_path)) window.open(a.url_path, "_blank", "noopener");
        return;
      case "call-service":
      case "perform-action": {
        const sv = a.service || a.perform_action;
        if (!sv || !sv.includes(".") || !h) return;
        const [d, s] = sv.split(".");
        h.callService(d, s, a.service_data || a.data || {}, a.target);
        return;
      }
      default:
        this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: a.entity || c.entity }, bubbles: true, composed: true }));
    }
  }
}

const EDITOR_SCHEMA = [
  { name: "entity", required: true, selector: { entity: {} } },
  { name: "name", selector: { text: {} } },
  { name: "attribute", selector: { text: {} } },
  { name: "attribute_max", selector: { text: {} } },
  { type: "grid", name: "", schema: [
    { name: "min", selector: { number: { mode: "box" } } },
    { name: "max", selector: { number: { mode: "box" } } },
    { name: "decimals", selector: { number: { min: 0, max: 10, mode: "box" } } },
    { name: "units", selector: { text: {} } },
    { name: "stroke_width", selector: { number: { min: 1, max: 20, mode: "box" } } },
    { name: "stroke_bg_width", selector: { number: { min: 1, max: 20, mode: "box" } } },
    { name: "stroke_color", selector: { text: {} } },
    { name: "stroke_bg_color", selector: { text: {} } },
  ] },
  { name: "show_max", selector: { boolean: {} } },
  { name: "gradient", selector: { boolean: {} } },
  { name: "show_card", selector: { boolean: {} } },
];

export class RoundSensorCardEditor extends HTMLElement {
  setConfig(config) { this._config = config; this._render(); }
  set hass(h) { this._hass = h; if (this._form) this._form.hass = h; }
  _render() {
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => (s.name || "").replace(/_/g, " ");
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const config = { ...(this._config || {}), ...(ev.detail.value || {}) };
        for (const k of Object.keys(config)) if (config[k] === "" || config[k] === undefined || config[k] === null) delete config[k];
        this._config = config;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
      const note = document.createElement("p");
      note.textContent = "Color stops and font styling are set in YAML (color_stops, font_style).";
      note.style.cssText = "font-size:12px;opacity:.7";
      this.appendChild(note);
    }
    this._form.hass = this._hass;
    this._form.schema = EDITOR_SCHEMA;
    this._form.data = { ...DEFAULTS, ...this._config };
  }
}

if (typeof customElements !== "undefined") {
  if (!customElements.get("round-sensor-card")) customElements.define("round-sensor-card", RoundSensorCard);
  if (!customElements.get("round-sensor-card-editor")) customElements.define("round-sensor-card-editor", RoundSensorCardEditor);
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === "round-sensor-card")) {
    window.customCards.push({ type: "round-sensor-card", name: "Round Sensor Card", description: "A circular gauge for one sensor, as a card or a picture-elements element.", preview: false });
  }
  console.info(`%c ROUND-SENSOR-CARD %c v${CARD_VERSION} `, "color:white;background:#03a9f4;font-weight:700", "color:#03a9f4;background:white");
}
