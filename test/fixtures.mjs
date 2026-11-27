export function mockHass(over = {}) {
  const calls = [];
  return {
    calls,
    states: {
      "sensor.temp": { state: "21.456", attributes: { friendly_name: "Living room", unit_of_measurement: "°C", feels_like: "30", ambient: "42" } },
      "sensor.low": { state: "10", attributes: { friendly_name: "Low", unit_of_measurement: "%" } },
      "sensor.off": { state: "unavailable", attributes: { friendly_name: "Offline" } },
      "sensor.xss": { state: "5", attributes: { friendly_name: "<img src=x onerror=alert(1)>", unit_of_measurement: "<b>" } },
    },
    callService(...a) { calls.push(a); },
    ...over,
  };
}
