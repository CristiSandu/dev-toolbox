import { invoke } from "@tauri-apps/api/core";
import { sanitizeBarcodeInput } from "@/lib/utils";
import { CODE_TYPE_TO_KIND, type CodeType } from "@/components/code-generator/codegen-types";

export interface GeneratedCode { text: string; type: CodeType; dataUrl: string; svgDataUrl?: string; description?: string }
export async function generateCode(type: CodeType, text: string): Promise<GeneratedCode> {
  const args = { kind: CODE_TYPE_TO_KIND[type], data: sanitizeBarcodeInput(text) };
  const dataUrl = await invoke<string>("generate_barcode", { ...args, format: type === "Code128" ? "png" : "svg" });
  let svgDataUrl: string | undefined;
  if (type === "Code128") {
    try { svgDataUrl = await invoke<string>("generate_barcode", { ...args, format: "svg" }); }
    catch { /* PNG remains usable; SVG actions can retry on demand. */ }
  }
  return { text, type, dataUrl, svgDataUrl };
}

export async function svgForCode(result: GeneratedCode) {
  if (result.svgDataUrl) return result.svgDataUrl;
  if (result.dataUrl.startsWith("data:image/svg+xml")) return result.dataUrl;
  return invoke<string>("generate_barcode", { kind: CODE_TYPE_TO_KIND[result.type], data: sanitizeBarcodeInput(result.text), format: "svg" });
}
