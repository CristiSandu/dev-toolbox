import test from "node:test";
import assert from "node:assert/strict";
import {
  parseProducts,
  safeImageUrl,
  safeMarkdownUrl,
  newCase,
  validateCase,
  generationKey,
  testPlanLoadError,
} from "../src/features/test-plans/model.ts";

const product = {
  text: "0012345678905",
  type: "EAN-13",
  title: "Sample",
  imageUrl: "https://example.com/sample.png",
  description: "Package",
};
test("an outdated native build gives a recovery instruction while other errors remain visible", () => {
  for (const command of ["list_test_projects", "list_test_cases"]) {
    const message = testPlanLoadError(`Command ${command} not found`);
    assert.match(message, /open the updated app/);
    assert.doesNotMatch(message, /Command .* not found/);
  }
  assert.equal(testPlanLoadError("database is locked"), "database is locked");
});
test("product JSON preserves leading zeroes, duplicates, formats, and product metadata with distinct IDs", () => {
  const rows = parseProducts(
    JSON.stringify([product, product, { text: "link", type: "qr" }]),
    "json",
    "Code128",
  );
  assert.equal(rows[0].text, "0012345678905");
  assert.equal(rows[0].title, "Sample");
  assert.equal(rows[0].imageUrl, product.imageUrl);
  assert.notEqual(rows[0].id, rows[1].id);
  assert.equal(rows[2].type, "QR Code");
});
test("bulk validation rejects the entire input when any item is malformed", () => {
  for (const value of [
    "{",
    "{}",
    "[]",
    JSON.stringify([product, null]),
    JSON.stringify([product, { text: 123, type: "qr" }]),
    JSON.stringify([{ ...product, type: "bad" }]),
    JSON.stringify([{ ...product, imageUrl: "javascript:alert(1)" }]),
    JSON.stringify([{ ...product, title: 5 }]),
  ]) {
    assert.throws(() => parseProducts(value, "json", "QR Code"));
  }
});
test("line input skips blanks and preserves order with the chosen type", () => {
  const rows = parseProducts("001\r\n\r\n 002 ", "lines", "Code128");
  assert.deepEqual(
    rows.map((row) => [row.text, row.type]),
    [
      ["001", "Code128"],
      ["002", "Code128"],
    ],
  );
});
test("URL policies reject executable, local, relative, and credential-bearing URLs", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:image/svg+xml,<svg/>",
    "file:///tmp/a",
    "//example.com/a",
    "/a",
    "https://user:pass@example.com/a",
    " https://example.com/a",
  ]) {
    assert.equal(safeImageUrl(url), false, url);
    assert.equal(safeMarkdownUrl(url, true), "", url);
  }
  assert.equal(safeImageUrl(""), true);
  assert.equal(safeMarkdownUrl("javascript:alert(1)"), "");
  assert.equal(safeMarkdownUrl("https://example.com"), "https://example.com");
  assert.equal(safeMarkdownUrl("#setup"), "#setup");
  assert.equal(
    safeMarkdownUrl("https://example.com/a.png", true),
    "https://example.com/a.png",
  );
});
test("case limits and required fields are enforced without rejecting intentionally invalid barcode data", () => {
  const content = newCase();
  assert.equal(validateCase(content), null);
  content.descriptionMarkdown = "# Scenario\n\n- [ ] Scan **all** codes";
  content.lists[0].products = parseProducts(
    JSON.stringify([{ ...product, text: "invalid EAN fixture" }]),
    "json",
    "EAN-13",
  );
  assert.equal(validateCase(content), null);
  const restored = JSON.parse(JSON.stringify(content));
  assert.equal(restored.descriptionMarkdown, content.descriptionMarkdown);
  content.title = " ";
  assert.match(validateCase(content), /title/);
  content.title = "Case";
  content.lists = [];
  assert.match(validateCase(content), /lists/);
});
test("code cache keys change only when the encoded source or format changes", () => {
  const row = parseProducts(JSON.stringify([product]), "json", "QR Code")[0];
  assert.equal(
    generationKey(row),
    generationKey({ ...row, title: "Other", imageUrl: "" }),
  );
  assert.notEqual(
    generationKey(row),
    generationKey({ ...row, text: "new value" }),
  );
  assert.notEqual(
    generationKey(row),
    generationKey({ ...row, type: "QR Code" }),
  );
});

test("the description renderer formats GFM and removes raw HTML and executable URLs", async () => {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({
    server: { middlewareMode: true },
    // SSR does not need browser dependency scanning (including generated installer assets).
    optimizeDeps: { noDiscovery: true, include: [] },
    appType: "custom",
  });
  try {
    const { MarkdownDescription } = await server.ssrLoadModule(
      "/src/features/test-plans/MarkdownDescription.tsx",
    );
    const source =
      '# Scenario\n\n**Scan all** products.\n\n- [ ] Verify\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```json\n{"ready": true}\n```\n\n<script>alert(1)</script>\n\n[Unsafe](javascript:alert(1))\n\n![Unsafe](data:image/svg+xml,evil)\n\n![Safe](https://example.com/product.png)';
    const html = renderToStaticMarkup(
      createElement(MarkdownDescription, { source }),
    );
    assert.match(html, /<h1>Scenario<\/h1>/);
    assert.match(html, /<strong>Scan all<\/strong>/);
    assert.match(html, /<table>/);
    assert.match(html, /type="checkbox"/);
    assert.match(html, /<code class="language-json">/);
    assert.match(html, /src="https:\/\/example.com\/product.png"/);
    assert.match(html, /referrerPolicy="no-referrer"/);
    assert.doesNotMatch(html, /<script|javascript:|data:image|alert\(1\)/);
  } finally {
    await server.close();
  }
});
