import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCasePdf,
  markdownPdf,
  pdfEntryColumns,
} from "../src/features/test-plans/pdf-document.ts";
import { newCase, parseProducts } from "../src/features/test-plans/model.ts";

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="white"/><rect x="10" y="10" width="80" height="80" fill="black"/></svg>';
function fixture() {
  const source = newCase();
  source.title = "Checkout · Cafea și ceai · Проверка";
  source.descriptionMarkdown =
    '# Scan products\n\n**Every entry** must appear.\n\n- [x] Prepared\n- [ ] Verify\n\n| Format | Result |\n| --- | --- |\n| QR | Pass |\n\n```json\n{"ready": true}\n```';
  source.lists[0].products = parseProducts(
    JSON.stringify([
      {
        title: "First duplicate",
        text: "0001",
        type: "QR Code",
        imageUrl: "https://example.com/product.png",
      },
      {
        title: "Second duplicate",
        text: "0001",
        type: "QR Code",
        description: "Preserve this description",
      },
      { title: "Invalid EAN", text: "123", type: "EAN-13" },
    ]),
    "json",
    "QR Code",
  );
  source.lists.push({
    id: "returns",
    name: "Returns",
    products: parseProducts("RETURN-001", "lines", "Code128"),
  });
  source.lists.push({ id: "empty", name: "Empty list", products: [] });
  const assets = new Map(
    source.lists.flatMap((list) =>
      list.products.map((product) => [
        product.id,
        product.type === "EAN-13"
          ? { error: "EAN-13 must be 12 or 13 digits" }
          : { svg },
      ]),
    ),
  );
  return { source, assets };
}
test("PDF includes all lists, duplicate entries, full values, image URLs, descriptions and failed codes in source order", () => {
  const { source, assets } = fixture();
  const document = buildCasePdf(source, "Project", assets);
  const json = JSON.stringify(document);
  for (const expected of [
    source.title,
    "4 entries across 3 lists",
    "First duplicate",
    "Second duplicate",
    "Preserve this description",
    "https://example.com/product.png",
    "EAN-13 must be 12 or 13 digits",
    "RETURN-001",
    "Empty list",
    "No entries in this list.",
  ])
    assert.ok(json.includes(expected), expected);
  assert.equal(json.match(/"0001"/g).length, 2);
  assert.ok(json.indexOf("First duplicate") < json.indexOf("Second duplicate"));
  assert.ok(json.indexOf("Second duplicate") < json.indexOf("Invalid EAN"));
  assert.equal(document.footer(1, 4).text, "Dev Toolbox  |  1 / 4");
});
test("PDF Markdown preserves formatting and GFM while removing HTML and unsafe links", () => {
  const json = JSON.stringify(
    markdownPdf(
      "# Heading\n\n**Bold** and *emphasis*.\n\n- [x] Ready\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n<script>evil()</script>\n\n[Unsafe](javascript:alert(1))",
    ),
  );
  assert.match(json, /Heading/);
  assert.match(json, /"bold":true/);
  assert.match(json, /"italics":true/);
  assert.match(json, /\[x\]/);
  assert.match(json, /"headerRows":1/);
  assert.doesNotMatch(json, /evil|javascript:|<script/);
});
test("long values and descriptions remain flowing text outside unbreakable image blocks", () => {
  const { source, assets } = fixture();
  const product = source.lists[0].products[0];
  product.title = "";
  product.text = "LONG".repeat(8000);
  product.description = "Details ".repeat(4000);
  const document = buildCasePdf(source, "Project", assets);
  const json = JSON.stringify(document);
  assert.ok(json.includes(product.text));
  assert.ok(json.includes(product.description));
  assert.ok(
    !JSON.stringify(
      document.content.filter((entry) => entry.unbreakable),
    ).includes(product.text),
  );
});
test("the PDF engine produces a real paginated document with embedded fonts and vector codes", async () => {
  const pdfMake = (await import("pdfmake/build/pdfmake.js")).default;
  const fonts = (await import("pdfmake/build/fonts/Roboto.js")).default;
  pdfMake.addFontContainer(fonts);
  const { source, assets } = fixture();
  const buffer = await pdfMake
    .createPdf(buildCasePdf(source, "Project", assets))
    .getBuffer();
  assert.ok(buffer.subarray(0, 5).toString() === "%PDF-");
  assert.ok(buffer.length > 10000);
  assert.match(buffer.toString("latin1"), /\/Type \/Pages/);
  assert.match(buffer.toString("latin1"), /\/FontFile2/);
});

test("PDF density adapts to code dimensions and keeps long metadata in a flowing full-width entry", () => {
  const { source } = fixture();
  const product = source.lists[0].products[0];
  assert.equal(pdfEntryColumns(product, { svg }), 4);
  const dense = svg
    .replaceAll('width="100"', 'width="800"')
    .replaceAll('height="100"', 'height="820"');
  assert.equal(pdfEntryColumns(product, { svg: dense }), 2);
  assert.equal(
    pdfEntryColumns(
      { ...product, type: "Code128" },
      { svg: svg.replaceAll('width="100"', 'width="300"') },
    ),
    1,
  );
  assert.equal(
    pdfEntryColumns({ ...product, description: "long ".repeat(200) }, { svg }),
    1,
  );
});
test("compact PDF rows keep whole entries together without forcing a fresh page for each list", () => {
  const { source, assets } = fixture();
  source.lists[0].products = parseProducts(
    Array.from({ length: 12 }, (_, index) => `QR-${index}`).join("\n"),
    "lines",
    "QR Code",
  );
  for (const product of source.lists[0].products)
    assets.set(product.id, { svg });
  const document = buildCasePdf(source, "Project", assets);
  const rows = document.content.filter((node) => node.table?.dontBreakRows);
  assert.ok(rows.length >= 3);
  assert.ok(rows.slice(0, 3).every((node) => node.table.body[0].length === 4));
  assert.ok(!document.content.some((node) => node.pageBreak === "before"));
});

test("codes-only PDF contains codes and titles underneath without case text, images, metadata or encoded labels", () => {
  const { source, assets } = fixture();
  const first = source.lists[0].products[0];
  assets.set(first.id, {
    svg: svg.replace("</svg>", '<text x="0" y="90">RAW-ENCODED</text></svg>'),
    image: "PRODUCT-IMAGE-DATA",
  });
  const document = buildCasePdf(source, "Project", assets, true);
  const body = JSON.stringify(document.content);
  for (const title of ["First duplicate", "Second duplicate", "Invalid EAN"])
    assert.ok(body.includes(title));
  for (const excluded of [
    source.title,
    "Project",
    "Scan products",
    "Preserve this description",
    "https://example.com/product.png",
    "PRODUCT-IMAGE-DATA",
    "RAW-ENCODED",
    "Value: ",
    "4 entries across",
  ])
    assert.ok(!body.includes(excluded), excluded);
  assert.ok(body.includes("EAN-13 must be 12 or 13 digits"));
  assert.ok(body.indexOf('"svg"') < body.indexOf("First duplicate"));
  assert.equal(document.footer, undefined);
  assert.ok(!document.content.some((node) => node.headlineLevel));
});
test("codes-only layout ignores omitted descriptions and URLs when choosing columns", () => {
  const { source } = fixture();
  const product = {
    ...source.lists[0].products[0],
    description: "Details ".repeat(1000),
    imageUrl: "https://example.com/" + "a".repeat(1000),
  };
  assert.equal(pdfEntryColumns(product, { svg }), 1);
  assert.equal(pdfEntryColumns(product, { svg }, true), 4);
});
