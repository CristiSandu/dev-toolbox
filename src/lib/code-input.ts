import { CODE_TYPES, CODE_TYPE_TO_KIND, type CodeType, type HistoryPayload, type MultiInputMode } from "../components/code-generator/codegen-types.ts";

export function normalizeType(raw: string) {
  const value = raw.trim().toLowerCase();
  const uiType = CODE_TYPES.find(type => type.toLowerCase() === value || CODE_TYPE_TO_KIND[type] === value) ?? (["ean128", "gs1-128"].includes(value) ? "Code128" : null);
  return uiType ? { uiType, kind: CODE_TYPE_TO_KIND[uiType] } : null;
}

export interface BatchItem { text: string; type: CodeType; description: string; position: number }

export function isSamePayload(a: HistoryPayload | null, b: HistoryPayload | null) {
  if (!a || !b || a.mode !== b.mode) return false;
  return a.mode === "single"
    ? a.singleText === b.singleText && a.singleType === b.singleType
    : a.multiText === b.multiText && a.multiType === b.multiType && a.multiMode === b.multiMode;
}

export function codeHistorySummary(payload: HistoryPayload | null, fallback = "Saved code") {
  if (!payload) return fallback;
  if (payload.mode === "single") return `${payload.singleType} · ${payload.singleText}`;
  try {
    const { items } = parseBatchInput(payload.multiText ?? "", payload.multiMode ?? "lines", payload.multiType ?? "QR Code");
    return `${payload.multiMode === "json" ? "Mixed-format batch" : `${payload.multiType} batch`} · ${items.length} input${items.length === 1 ? "" : "s"}`;
  } catch { return "Batch generation"; }
}

export function parseBatchInput(text: string, mode: MultiInputMode, type: CodeType): { items: BatchItem[]; errors: string[] } {
  if (mode === "lines") return { items: text.split(/\r?\n/).flatMap((line, index) => line.trim() ? [{ text: line.trim(), type, description: "", position: index + 1 }] : []), errors: [] };
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("Invalid JSON. Use an array of objects with text and type fields."); }
  if (!Array.isArray(parsed)) throw new Error("JSON must be an array of objects with text and type fields.");
  if (!parsed.length) throw new Error("The JSON array is empty. Add at least one code.");
  const items: BatchItem[] = [], errors: string[] = [];
  parsed.forEach((entry: unknown, index) => {
    if (!entry || typeof entry !== "object") { errors.push(`Item ${index + 1}: expected an object with text and type.`); return; }
    const value = entry as Record<string, unknown>;
    const payload = typeof value.text === "string" || typeof value.text === "number" ? String(value.text).trim() : "";
    const normalized = typeof value.type === "string" ? normalizeType(value.type) : null;
    if (!payload || !normalized) { errors.push(`Item ${index + 1}: add text and a supported code type.`); return; }
    items.push({ text: payload, type: normalized.uiType, description: typeof value.description === "string" ? value.description : "", position: index + 1 });
  });
  return { items, errors };
}

export function parseCodeHistory(raw: string): HistoryPayload | null {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    if (value.mode === "single" && typeof value.singleText === "string" && typeof value.singleType === "string") {
      const type = normalizeType(value.singleType);
      return type ? { mode: "single", singleText: value.singleText, singleType: type.uiType } : null;
    }
    if (value.mode === "multi") {
      if (Array.isArray(value.items)) return { mode: "multi", multiMode: "json", multiType: "QR Code", multiText: JSON.stringify(value.items, null, 2) };
      if (typeof value.multiText !== "string" || !["lines", "json"].includes(value.multiMode)) return null;
      const type = typeof value.multiType === "string" ? normalizeType(value.multiType) : null;
      return type ? { mode: "multi", multiText: value.multiText, multiMode: value.multiMode, multiType: type.uiType } : null;
    }
    return null;
  } catch { return null; }
}
