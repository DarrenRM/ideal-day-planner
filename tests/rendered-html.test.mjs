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
  assert.match(html, />Shake</);
  assert.match(html, />Breakfast</);
  assert.match(html, /Drag a handle to reorder/);
  assert.match(html, /Adjust minutes on any block/);
  assert.match(html, /Add Activity/);
  assert.doesNotMatch(html, /Reset order/);
  assert.match(html, /aria-label="Edit Walk in sun"/);
  assert.match(html, /aria-label="Remove Walk in sun"/);
  assert.match(html, /aria-label="Idealized day schedule"/);
  assert.doesNotMatch(html, /Mobility · breathe and open up/);
  assert.doesNotMatch(html, /Move Stretch \/ yoga up/);
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
  assert.doesNotMatch(page, /resetOrder/);
  assert.match(page, /addItem/);
  assert.match(page, /normalizeActivityDuration/);
  assert.match(page, /Math\.round\(duration \/ 5\) \* 5/);
  assert.match(page, /id="block-duration"[\s\S]*?min="5"[\s\S]*?step="5"/);
  assert.match(page, /custom-/);
  assert.match(page, /Remove \$\{item\.title\}/);
  assert.match(page, /DELETED_KEY/);
  assert.match(page, /setDeletedDefaultIds/);
  assert.match(page, /startEditing/);
  assert.match(page, /saveEdit/);
  assert.match(page, /handleOutsidePointerDown/);
  assert.match(page, /closest\("\.inline-edit-form"\)/);
  assert.match(page, /Tag for \$\{item\.title\}/);
  assert.doesNotMatch(page, /check-button|setCompleted|COMPLETE_KEY/);
  assert.match(css, /--bg: #0a0c0f/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /\.drop-indicator/);
  assert.match(css, /\.duration-control/);
  assert.match(css, /\.add-block-form/);
  assert.match(css, /\.edit-item-button/);
  assert.match(page, /GripVertical/);
  assert.match(page, /Pencil/);
  assert.match(page, /Trash2/);
  assert.match(css, /\.delete-item-button/);
  assert.match(css, /\.inline-edit-form/);
});
