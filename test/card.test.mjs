import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mockHass } from "./fixtures.mjs";

const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true, url: "http://localhost/" });
for (const k of ["window", "document", "HTMLElement", "customElements", "CustomEvent", "Event"]) {
  Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
}
const { colorFor, stopsFrom } = await import("../round-sensor-card.js");
const make = (config, hass = mockHass()) => {
  const el = document.createElement("round-sensor-card");
  document.body.appendChild(el);
  el.setConfig(config);
  el.hass = hass;
  return el;
};
const q = (el, s) => el.shadowRoot.querySelector(s);
const txt = (el, s) => q(el, s)?.textContent.trim();
const dash = (el) => Number(q(el, ".arc").getAttribute("stroke-dasharray").split(" ")[0]);
const CIRC = 2 * Math.PI * 44;

test("registers element, editor and customCards entry", () => {
  assert.ok(customElements.get("round-sensor-card"));
  assert.ok(customElements.get("round-sensor-card-editor"));
  assert.ok(window.customCards.some((c) => c.type === "round-sensor-card"));
});
test("rejects bad config", () => {
  const el = document.createElement("round-sensor-card");
  assert.throws(() => el.setConfig(null));
  assert.throws(() => el.setConfig({}));
  assert.throws(() => el.setConfig({ entity: "nodot" }));
});
test("renders rounded value and unit from the entity", () => {
  const el = make({ entity: "sensor.temp" });
  assert.equal(txt(el, ".val"), "21.46°C");
  assert.equal(q(el, ".arc").getAttribute("transform"), "rotate(-90 50 50)");
});
test("arc length follows min/max", () => {
  const el = make({ entity: "sensor.low", min: 0, max: 40 });
  assert.ok(Math.abs(dash(el) - CIRC * 0.25) < 0.01);
});
test("value is clamped and degenerate range does not break", () => {
  assert.ok(Math.abs(dash(make({ entity: "sensor.low", max: 5 })) - CIRC) < 0.01);
  assert.equal(dash(make({ entity: "sensor.low", min: 50, max: 50 })), 0);
  assert.equal(dash(make({ entity: "sensor.low", min: 50, max: 100 })), 0);
});
test("unavailable state shows a dash and an empty ring", () => {
  const el = make({ entity: "sensor.off" });
  assert.equal(txt(el, ".val"), "–");
  assert.equal(dash(el), 0);
});
test("missing entity shows a message, no throw", () => {
  const el = make({ entity: "sensor.nope" });
  assert.match(txt(el, ".empty"), /Entity not found: sensor\.nope/);
});
test("attribute and attribute_max replace state and max; show_max prints it", () => {
  const el = make({ entity: "sensor.temp", attribute: "feels_like", attribute_max: "ambient", show_max: true, units: "deg" });
  assert.equal(txt(el, ".val"), "30deg");
  assert.equal(txt(el, ".max"), "/ 42");
  assert.ok(Math.abs(dash(el) - CIRC * (30 / 42)) < 0.01);
});
test("units override; blank units hides the unit; decimals applied", () => {
  assert.equal(txt(make({ entity: "sensor.temp", units: " ", decimals: 1 }), ".val"), "21.5");
  assert.equal(txt(make({ entity: "sensor.temp", decimals: 0 }), ".val"), "21°C");
});
test("name shown and used in the aria label", () => {
  const el = make({ entity: "sensor.temp", name: "Lounge" });
  assert.equal(txt(el, ".name"), "Lounge");
  assert.equal(q(el, ".box").getAttribute("aria-label"), "Lounge: 21.46 °C");
});
test("color stops: step and gradient", () => {
  const stops = stopsFrom({ 50: "#00ff00", 100: "#ff0000" });
  assert.equal(colorFor(30, stops, false, "x"), "#00ff00");
  assert.equal(colorFor(70, stops, false, "x"), "#ff0000");
  assert.equal(colorFor(500, stops, false, "x"), "#ff0000");
  assert.equal(colorFor(75, stops, true, "x"), "#808000");
  assert.equal(colorFor(10, stops, true, "x"), "#00ff00");
  assert.equal(colorFor(null, stops, true, "fb"), "fb");
  assert.equal(colorFor(60, stopsFrom({ 50: "red", 100: "blue" }), true, "x"), "blue");
  const el = make({ entity: "sensor.low", color_stops: { 50: "#00ff00", 100: "#ff0000" } });
  assert.equal(q(el, ".arc").style.stroke, "#00ff00");
});
test("stroke colors, widths and fill apply", () => {
  const el = make({ entity: "sensor.low", stroke_color: "#112233", stroke_bg_color: "#445566", stroke_width: 9, stroke_bg_width: 3, fill: "#abcdef" });
  assert.equal(q(el, ".arc").style.stroke, "#112233");
  assert.equal(q(el, ".track").style.stroke, "#445566");
  assert.equal(q(el, ".arc").getAttribute("stroke-width"), "9");
  assert.equal(q(el, ".track").getAttribute("stroke-width"), "3");
  assert.equal(q(el, ".face").style.fill, "#abcdef");
});
test("font_style allowlist: safe props applied, unsafe dropped", () => {
  const el = make({ entity: "sensor.low", font_style: { color: "red", "font-size": "1.5em", "text-shadow": "2px 2px black", position: "fixed", "font-family": "x; background:url(http://e/)" } });
  const s = q(el, ".val").style;
  assert.equal(s.fill, "red");
  assert.equal(s.getPropertyValue("font-size"), "1.5em");
  assert.equal(s.getPropertyValue("position"), "");
  assert.equal(s.getPropertyValue("font-family"), "");
});
test("entity names and units are escaped", () => {
  const el = make({ entity: "sensor.xss", name: "<script>x</script>" });
  assert.equal(el.shadowRoot.querySelectorAll("script, img, b").length, 0);
  assert.match(txt(el, ".val"), /<b>/);
});
test("show_card wraps in ha-card; default does not", () => {
  assert.ok(q(make({ entity: "sensor.low", show_card: true }), "ha-card"));
  assert.equal(q(make({ entity: "sensor.low" }), "ha-card"), null);
});
test("tap: default more-info event", () => {
  const el = make({ entity: "sensor.low" });
  let got;
  el.addEventListener("hass-more-info", (e) => (got = e.detail));
  q(el, ".box").click();
  assert.deepEqual(got, { entityId: "sensor.low" });
});
test("tap: keyboard, none, call-service, navigate", () => {
  const h = mockHass();
  let n = 0;
  const el = make({ entity: "sensor.low", tap_action: { action: "call-service", service: "light.turn_on", service_data: { entity_id: "light.a" } } }, h);
  q(el, ".box").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
  assert.deepEqual(h.calls[0].slice(0, 3), ["light", "turn_on", { entity_id: "light.a" }]);
  const none = make({ entity: "sensor.low", tap_action: { action: "none" } });
  none.addEventListener("hass-more-info", () => n++);
  q(none, ".box").click();
  assert.equal(n, 0);
  assert.equal(q(none, ".box").getAttribute("tabindex"), null);
  const nav = make({ entity: "sensor.low", tap_action: { action: "navigate", navigation_path: "/lovelace/x" } });
  nav.hass = mockHass();
  q(nav, ".box").click();
  assert.equal(window.location.pathname, "/lovelace/x");
});
test("updates on new hass", () => {
  const h = mockHass();
  const el = make({ entity: "sensor.low", max: 100 }, h);
  assert.ok(Math.abs(dash(el) - CIRC * 0.1) < 0.01);
  const h2 = mockHass(); h2.states["sensor.low"] = { state: "50", attributes: {} };
  el.hass = h2;
  assert.ok(Math.abs(dash(el) - CIRC * 0.5) < 0.01);
});
test("stub config picks a numeric sensor", () => {
  const C = customElements.get("round-sensor-card");
  assert.equal(C.getStubConfig(mockHass()).entity, "sensor.temp");
});
test("editor emits config-changed and drops empty values", () => {
  const ed = document.createElement("round-sensor-card-editor");
  ed.setConfig({ entity: "sensor.low", name: "A", color_stops: { 50: "red" } });
  const form = ed.querySelector("ha-form");
  assert.ok(form.schema.length > 5);
  assert.equal(form.data.max, 100);
  let cfg;
  ed.addEventListener("config-changed", (e) => (cfg = e.detail.config));
  form.dispatchEvent(new CustomEvent("value-changed", { detail: { value: { entity: "sensor.low", name: "", max: 40 } } }));
  assert.deepEqual(cfg, { entity: "sensor.low", max: 40, color_stops: { 50: "red" } });
});
