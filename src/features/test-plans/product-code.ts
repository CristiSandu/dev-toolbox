import { isTauri } from "@tauri-apps/api/core";
import { generateCode } from "@/lib/code-generation";
import { sanitizeBarcodeInput } from "@/lib/utils";
import type { Product } from "./model";

export async function generateProductCode(product: Product) {
  if (!isTauri())
    throw new Error("Open the desktop app to generate codes locally.");
  if (!product.text.trim()) throw new Error("Enter a value before generating.");
  // The shared generator normalizes input. Refuse silent changes in test fixtures.
  if (sanitizeBarcodeInput(product.text) !== product.text)
    throw new Error(
      "Use printable ASCII without leading/trailing spaces or control characters. The shared generator would alter this value.",
    );
  return generateCode(product.type, product.text);
}
