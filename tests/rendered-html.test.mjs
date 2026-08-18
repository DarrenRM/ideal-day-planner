import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the idealized day planner", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Idealized day<\/title>/i);
  assert.match(html, /Your ideal morning\./);
  assert.match(html, /Walk in sun/);
  assert.match(html, /Stretch \/ yoga/);
  assert.match(html, /Energy drink \/ shake/);
  assert.match(html, /Drag from the grip to reorder/);
  assert.match(html, /Adjust minutes directly/);
  assert.match(html, /aria-label="Idealized day schedule"/);
  assert.doesNotMatch(html, />Week</);
  assert.doesNotMatch(html, /Primary navigation/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|SkeletonPreview/i);
});

test("keeps the routine data and interactions in the page", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /localStorage/);
  assert.match(page, /draggable/);
  assert.match(page, /onDrop/);
  assert.match(page, /DropTarget/);
  assert.match(page, /adjustDuration/);
  assert.match(page, /setDuration/);
  assert.match(page, /Duration for .* in minutes/);
  assert.match(page, /resetOrder/);
  assert.match(page, /setCompleted/);
  assert.match(css, /--bg: #0a0c0f/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /\.drop-indicator/);
  assert.match(css, /\.duration-control/);
});
