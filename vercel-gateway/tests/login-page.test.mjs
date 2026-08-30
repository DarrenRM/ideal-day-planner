import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const script = await readFile(new URL("../public/gateway.js", import.meta.url), "utf8");

function loginPage(search = "") {
  const requests = [];
  const navigations = [];
  const listeners = new Map();
  const elements = {
    form: { addEventListener: (event, listener) => listeners.set(event, listener) },
    "#password": { value: "second demo password", select() {} },
    ".error": { textContent: "" },
    button: { disabled: false, textContent: "Continue" },
  };
  runInNewContext(script, {
    document: { querySelector: (selector) => elements[selector] },
    window: { location: { search, replace: (url) => navigations.push(url), assign: (url) => navigations.push(url) } },
    URLSearchParams,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ ok: true, redirectTo: "/testing" }) };
    },
  });
  return { requests, navigations, listeners, elements };
}

test("opening login does not probe or redirect an existing session", async () => {
  const page = loginPage();
  await Promise.resolve();
  assert.deepEqual(page.requests, []);
  assert.deepEqual(page.navigations, []);
  assert.equal(page.elements.button.disabled, false);
  assert.equal(typeof page.listeners.get("submit"), "function");
});

test("login submits the chosen password before navigating to the new demo", async () => {
  const page = loginPage("?next=%2Ftesting");
  let prevented = false;
  await page.listeners.get("submit")({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(page.requests.length, 1);
  assert.equal(page.requests[0].url, "/_ideal-day/login");
  assert.equal(page.requests[0].options.method, "POST");
  assert.deepEqual(JSON.parse(page.requests[0].options.body), { password: "second demo password", returnTo: "/testing" });
  assert.equal(page.elements["#password"].value, "");
  assert.deepEqual(page.navigations, ["/testing"]);
});
