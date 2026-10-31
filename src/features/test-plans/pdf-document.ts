import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Nodes } from "mdast";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { safeMarkdownUrl, type CaseContent, type Product } from "./model.ts";

export interface PdfProductAsset {
  svg?: string;
  png?: string;
  error?: string;
  image?: string;
}

// Convert the same safe GFM source into flowing PDF text, rather than a screenshot.
export function markdownPdf(source: string): Content[] {
  const root = unified().use(remarkParse).use(remarkGfm).parse(source);
  const inline = (node: Nodes): Content => {
    const children = "children" in node ? node.children.map(inline) : [];
    switch (node.type) {
      case "text":
        return node.value;
      case "break":
        return "\n";
      case "inlineCode":
        return { text: node.value, background: "#eef1f4" };
      case "strong":
        return { text: children, bold: true };
      case "emphasis":
        return { text: children, italics: true };
      case "delete":
        return { text: children, decoration: "lineThrough" };
      case "link":
        return {
          text: children,
          link: safeMarkdownUrl(node.url) || undefined,
          color: "#24517a",
          decoration: "underline",
        };
      case "image":
        return {
          text: `${node.alt || "Description image"}${safeMarkdownUrl(node.url, true) ? ` (${node.url})` : ""}`,
        };
      case "html":
        return "";
      case "footnoteReference":
        return `[${node.identifier}]`;
      default:
        return { text: children };
    }
  };
  const block = (node: Nodes): Content => {
    const children = "children" in node ? node.children : [];
    switch (node.type) {
      case "heading":
        return {
          text: children.map(inline),
          fontSize: [22, 18, 15, 13, 12, 11][node.depth - 1],
          bold: true,
          margin: [0, 12, 0, 8],
        };
      case "paragraph":
        return { text: children.map(inline), margin: [0, 0, 0, 9] };
      case "code":
        return {
          text: node.value,
          fontSize: 9,
          background: "#eef1f4",
          preserveLeadingSpaces: true,
          margin: [8, 4, 8, 12],
        };
      case "list": {
        const items = node.children.map((item): Content => ({
          stack: [
            ...(item.checked !== null && item.checked !== undefined
              ? [{ text: item.checked ? "[x]" : "[ ]", bold: true }]
              : []),
            ...item.children.map(block),
          ],
        }));
        return node.ordered
          ? { ol: items, start: node.start ?? 1, margin: [0, 0, 0, 10] }
          : { ul: items, margin: [0, 0, 0, 10] };
      }
      case "table":
        return {
          table: {
            headerRows: 1,
            widths: node.children[0].children.map(() => "*"),
            body: node.children.map((row, index) =>
              row.children.map((cell) => ({
                text: cell.children.map(inline),
                bold: index === 0,
                fillColor: index === 0 ? "#eef1f4" : undefined,
                margin: [3, 4, 3, 4],
              })),
            ),
          },
          layout: "lightHorizontalLines",
          fontSize: 9,
          margin: [0, 4, 0, 12],
        };
      case "blockquote":
        return {
          stack: children.map(block),
          italics: true,
          color: "#526170",
          margin: [16, 0, 0, 10],
        };
      case "thematicBreak":
        return {
          text: "________________________________________",
          color: "#aab3bd",
          margin: [0, 6, 0, 12],
        };
      case "html":
        return "";
      case "definition":
        return {
          text: `${node.identifier}: ${safeMarkdownUrl(node.url)}`,
          fontSize: 9,
          margin: [0, 0, 0, 8],
        };
      case "footnoteDefinition":
        return {
          stack: [
            { text: `[${node.identifier}]`, bold: true },
            ...node.children.map(block),
          ],
        };
      default:
        return inline(node);
    }
  };
  return root.children.map(block);
}

const PAGE_WIDTH = 595.28 - 60;
const CELL_GAP = 12;
const CELL_PADDING = 7;
function cellWidth(columns: number) {
  return (PAGE_WIDTH - (columns - 1) * CELL_GAP) / columns - 2 * CELL_PADDING;
}

function codeGeometry(product: Product, asset?: PdfProductAsset) {
  let width = 0,
    height = 0;
  if (asset?.svg) {
    const tag = asset.svg.match(/<svg\b[^>]*>/)?.[0] ?? "";
    width = Number(tag.match(/\bwidth=["']([\d.]+)["']/)?.[1]);
    height = Number(tag.match(/\bheight=["']([\d.]+)["']/)?.[1]);
  } else if (asset?.png) {
    try {
      const header = atob(asset.png.split(",")[1].slice(0, 44));
      const bytes = Uint8Array.from(header, (char) => char.charCodeAt(0));
      const view = new DataView(bytes.buffer);
      width = view.getUint32(16);
      height = view.getUint32(20);
    } catch {
      /* Unknown image dimensions use the conservative full-width layout. */
    }
  }
  const matrix = product.type === "QR Code" || product.type === "DataMatrix";
  // Native generators use 4 SVG units per QR module, 10 for DataMatrix,
  // 2 for EAN/Code128 PNG, and 1 for Code128 SVG. Keep modules physically legible.
  const unit =
    product.type === "QR Code"
      ? 4
      : product.type === "DataMatrix"
        ? 10
        : product.type === "Code128" && asset?.svg
          ? 1
          : 2;
  const quiet =
    product.type === "QR Code"
      ? 4
      : product.type === "DataMatrix"
        ? 1
        : product.type === "EAN-13"
          ? 11
          : 10;
  const minimumScale = (matrix ? 1.15 : 1) / unit;
  return {
    width,
    height,
    matrix,
    unit,
    quiet,
    minimumScale,
    minimumWidth: (width + 2 * quiet * unit) * minimumScale,
  };
}

export function pdfEntryColumns(
  product: Product,
  asset?: PdfProductAsset,
  codesOnly = false,
): number {
  if (
    !codesOnly &&
    (product.text.length > 180 ||
      product.description.length > 350 ||
      product.imageUrl.length > 180)
  )
    return 1;
  if (!asset?.svg && !asset?.png) return 3;
  const geometry = codeGeometry(product, asset);
  if (!(geometry.width > 0 && geometry.height > 0)) return 1;
  let columns = geometry.matrix ? 4 : 2;
  while (columns > 1 && geometry.minimumWidth > cellWidth(columns)) columns--;
  return columns;
}

function productCard(
  product: Product,
  asset: PdfProductAsset | undefined,
  number: number,
  available: number,
  codesOnly: boolean,
) {
  const geometry = codeGeometry(product, asset);
  const maxScale =
    available / (geometry.width + 2 * geometry.quiet * geometry.unit);
  const targetScale = geometry.matrix
    ? 72 / Math.max(geometry.width, geometry.height)
    : maxScale;
  const scale = Math.min(
    maxScale,
    Math.max(targetScale, geometry.minimumScale),
  );
  const quiet = Math.max(4, geometry.quiet * geometry.unit * scale);
  const width = geometry.width * scale,
    height = geometry.height * scale;
  const code: Content =
    asset?.svg || asset?.png
      ? {
          ...(asset.svg
            ? {
                svg: codesOnly
                  ? asset.svg.replace(/<text\b[^>]*>[\s\S]*?<\/text>/gi, "")
                  : asset.svg,
              }
            : { image: asset.png! }),
          alignment: codesOnly ? "center" : "left",
          ...(width > 0 && height > 0
            ? { width, height }
            : { fit: [available - 24, 100] as [number, number] }),
          margin: [
            quiet,
            geometry.matrix ? quiet : 5,
            quiet,
            geometry.matrix ? quiet : 5,
          ],
        }
      : {
          text: `Code unavailable: ${asset?.error || "Generation failed."}`,
          color: "#9b2525",
          fontSize: 8,
          margin: [0, 4, 0, 6],
        };
  if (codesOnly)
    return {
      header: {
        unbreakable: true,
        stack: [
          code,
          {
            text: product.title || "Untitled product",
            fontSize: 9,
            bold: true,
            alignment: "center",
            margin: [0, 3, 0, 5],
          },
        ],
      } as Content,
      details: [] as Content[],
    };
  const header: Content = {
    unbreakable: true,
    stack: [
      {
        columns: [
          {
            width: "*",
            stack: [
              {
                text: `${number}. ${product.title || "Product"}`,
                fontSize: 10,
                bold: true,
                margin: [0, 0, 0, 3],
              },
              {
                text: product.type,
                color: "#526170",
                fontSize: 7,
                margin: [0, 0, 0, 5],
              },
            ],
          },
          ...(asset?.image
            ? [
                {
                  width: 28,
                  image: asset.image,
                  fit: [26, 26] as [number, number],
                },
              ]
            : []),
        ],
        columnGap: 6,
      },
      code,
    ],
  };
  const details: Content[] = [
    {
      text: [{ text: "Value: ", bold: true }, { text: product.text }],
      margin: [0, 3, 0, 4],
      preserveLeadingSpaces: true,
    },
  ];
  if (product.description)
    details.push({
      text: product.description,
      preserveLeadingSpaces: true,
      margin: [0, 0, 0, 4],
    });
  if (product.imageUrl)
    details.push({
      text: [
        { text: asset?.image ? "Image: " : "Image unavailable: ", bold: true },
        { text: product.imageUrl, link: product.imageUrl },
      ],
      color: "#526170",
      fontSize: 6.5,
      margin: [0, 0, 0, 4],
    });
  if (geometry.minimumWidth > available && (asset?.svg || asset?.png))
    details.push({
      text: "Dense code: print enlarged for reliable scanning.",
      color: "#9b2525",
      fontSize: 8,
    });
  return { header, details };
}

export function buildCasePdf(
  source: CaseContent,
  projectName: string,
  assets: ReadonlyMap<string, PdfProductAsset>,
  codesOnly = false,
): TDocumentDefinitions {
  const count = source.lists.reduce(
    (total, list) => total + list.products.length,
    0,
  );
  const content: Content[] = codesOnly
    ? []
    : [
        { text: source.title, fontSize: 20, bold: true, margin: [0, 0, 0, 6] },
        {
          text: `${projectName}  |  ${count} entries across ${source.lists.length} lists`,
          color: "#526170",
          fontSize: 9,
          margin: [0, 0, 0, 12],
        },
        ...(source.descriptionMarkdown
          ? markdownPdf(source.descriptionMarkdown)
          : []),
      ];
  let entryNumber = 0;
  const lists = codesOnly
    ? [{ name: "", products: source.lists.flatMap((list) => list.products) }]
    : source.lists;
  for (const list of lists) {
    if (!codesOnly)
      content.push({
        text: `${list.name}  -  ${list.products.length} entries`,
        fontSize: 13,
        bold: true,
        margin: [0, 12, 0, 7],
        headlineLevel: 1,
      });
    if (!list.products.length)
      content.push({ text: "No entries in this list.", color: "#526170" });
    for (let index = 0; index < list.products.length;) {
      const product = list.products[index];
      let columns = pdfEntryColumns(product, assets.get(product.id), codesOnly);
      const following = list.products[index + 1];
      if (following) {
        const nextColumns = pdfEntryColumns(
          following,
          assets.get(following.id),
          codesOnly,
        );
        if (nextColumns > 1 && nextColumns < columns) columns = nextColumns;
      }
      if (columns === 1) {
        const card = productCard(
          product,
          assets.get(product.id),
          ++entryNumber,
          PAGE_WIDTH,
          codesOnly,
        );
        content.push({
          stack: [card.header, ...card.details],
          fontSize: 8,
          lineHeight: 1.1,
          margin: [0, 7, 0, 8],
        });
        index++;
        continue;
      }
      const cells: Content[] = [];
      while (cells.length < columns && index < list.products.length) {
        const next = list.products[index];
        if (pdfEntryColumns(next, assets.get(next.id), codesOnly) < columns)
          break;
        const card = productCard(
          next,
          assets.get(next.id),
          ++entryNumber,
          cellWidth(columns),
          codesOnly,
        );
        cells.push({
          stack: [card.header, ...card.details],
          fontSize: 8,
          lineHeight: 1.1,
        });
        index++;
      }
      while (cells.length < columns) cells.push("");
      content.push({
        table: {
          widths: Array.from({ length: columns }, () => "*"),
          dontBreakRows: true,
          body: [cells],
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => CELL_PADDING,
          paddingRight: () => CELL_PADDING,
          paddingTop: () => 6,
          paddingBottom: () => 7,
        },
        columnGap: CELL_GAP,
        margin: [0, 0, 0, 4],
      });
    }
  }
  return {
    info: {
      title: source.title,
      subject: `Test case - ${projectName}`,
      creator: "Dev Toolbox",
    },
    pageSize: "A4",
    pageMargins: [30, 30, 30, 36],
    defaultStyle: { font: "Roboto", fontSize: 9, lineHeight: 1.15 },
    content,
    pageBreakBefore: (node, queries) =>
      node.headlineLevel === 1 &&
      queries.getFollowingNodesOnPage().length === 0,
    footer: codesOnly
      ? undefined
      : (page, pages) => ({
          text: `Dev Toolbox  |  ${page} / ${pages}`,
          alignment: "right",
          color: "#526170",
          fontSize: 8,
          margin: [30, 12, 30, 0],
        }),
  };
}
