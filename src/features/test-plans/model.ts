import { normalizeType } from "../../lib/code-input.ts";
import type { CodeType } from "../../components/code-generator/codegen-types.ts";

export interface Product {
  id: string;
  title: string;
  text: string;
  type: CodeType;
  imageUrl: string;
  description: string;
}
export interface CodeList {
  id: string;
  name: string;
  products: Product[];
}
export interface CaseContent {
  schemaVersion: 1;
  title: string;
  descriptionMarkdown: string;
  lists: CodeList[];
}
export interface TestProject {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}
export interface TestCase {
  id: number;
  projectId: number;
  content: CaseContent;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface CaseRevision {
  revision: number;
  snapshot: CaseContent;
  changes: string[];
  createdAt: string;
}
export const LIMITS = {
  products: 5000,
  lists: 100,
  value: 32_000,
  markdown: 500_000,
  document: 2_000_000,
};
export function newList(name = "Products"): CodeList {
  return { id: crypto.randomUUID(), name, products: [] };
}
export function newCase(): CaseContent {
  return {
    schemaVersion: 1,
    title: "Untitled test case",
    descriptionMarkdown: "",
    lists: [newList()],
  };
}
export function productLabel(product: Product) {
  return product.title || product.text;
}
export function safeImageUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return (
      value === value.trim() &&
      value.length <= 8192 &&
      ["http:", "https:"].includes(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function safeMarkdownUrl(value: string, image = false): string {
  if (image) return value && safeImageUrl(value) ? value : "";
  if (/^#[^\s]*$/.test(value)) return value;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? value
      : "";
  } catch {
    return "";
  }
}
export function parseProducts(
  source: string,
  mode: "lines" | "json",
  type: CodeType,
): Product[] {
  if (new TextEncoder().encode(source).length > LIMITS.document)
    throw new Error("Bulk input exceeds 2 MB.");
  let entries: unknown;
  if (mode === "lines")
    entries = source
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((text) => ({ text: text.trim(), type }));
  else {
    try {
      entries = JSON.parse(source);
    } catch {
      throw new Error(
        "Invalid JSON. Use an array of objects with string text and type fields.",
      );
    }
  }
  if (!Array.isArray(entries) || !entries.length)
    throw new Error("Add at least one product. JSON input must be an array.");
  if (entries.length > LIMITS.products)
    throw new Error("A case supports up to 5,000 products.");
  return entries.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new Error(`Item ${index + 1}: expected a product object.`);
    const value = entry as Record<string, unknown>;
    const normalized =
      typeof value.type === "string" ? normalizeType(value.type) : null;
    const text = typeof value.text === "string" ? value.text : "";
    if (
      !text.trim() ||
      new TextEncoder().encode(text).length > LIMITS.value ||
      !normalized
    )
      throw new Error(
        `Item ${index + 1}: use a nonempty string text (up to 32 KB) and a supported type. Keep leading zeroes in quotes.`,
      );
    for (const field of ["title", "description", "imageUrl"]) {
      if (value[field] !== undefined && typeof value[field] !== "string")
        throw new Error(`Item ${index + 1}: ${field} must be a string.`);
    }
    const title = (value.title as string) ?? "",
      description = (value.description as string) ?? "",
      imageUrl = (value.imageUrl as string) ?? "";
    if (
      [...title].length > 200 ||
      new TextEncoder().encode(description).length > LIMITS.value
    )
      throw new Error(
        `Item ${index + 1}: title allows 200 characters; description allows 32 KB.`,
      );
    if (!safeImageUrl(imageUrl))
      throw new Error(
        `Item ${index + 1}: Image URL must be an absolute HTTP(S) URL without credentials.`,
      );
    return {
      id: crypto.randomUUID(),
      text,
      type: normalized.uiType,
      title,
      description,
      imageUrl,
    };
  });
}
export function validateCase(content: CaseContent): string | null {
  if (!content.title.trim() || [...content.title].length > 200)
    return "Enter a case title of 1–200 characters.";
  if (
    new TextEncoder().encode(content.descriptionMarkdown).length >
    LIMITS.markdown
  )
    return "Description exceeds 500 KB.";
  if (!content.lists.length || content.lists.length > LIMITS.lists)
    return "Use 1–100 code lists.";
  if (
    content.lists.reduce((sum, list) => sum + list.products.length, 0) >
    LIMITS.products
  )
    return "A case supports up to 5,000 products.";
  if (
    new TextEncoder().encode(JSON.stringify(content)).length > LIMITS.document
  )
    return "Case content exceeds 2 MB.";
  for (const list of content.lists) {
    if (!list.name.trim() || [...list.name].length > 200)
      return "Enter a list name of 1–200 characters.";
    try {
      if (list.products.length)
        parseProducts(JSON.stringify(list.products), "json", "QR Code");
    } catch (error) {
      return `${list.name}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  return null;
}
export function generationKey(product: Product) {
  return JSON.stringify([product.type, product.text]);
}

export function testPlanLoadError(error: unknown): string {
  const message = String(error);
  if (
    /command\s+(?:list_test_projects|list_test_cases)\s+not found/i.test(
      message,
    )
  ) {
    return "This desktop build does not include Test Plans. Close it and open the updated app to continue.";
  }
  return message;
}

export interface TransferDocument {
  format: "dev-toolbox-test-plans";
  version: 1;
  project?: { name: string; cases: CaseContent[] };
  testCase?: CaseContent;
}
