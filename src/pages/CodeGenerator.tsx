"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { Copy, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { useBarcode } from "@/hooks/use-barcode";
import { toast } from "sonner";

// -----------------------------
// Code Types (UI)
// -----------------------------
type CodeType = "QR Code" | "EAN-13" | "DataMatrix" | "Ean128";

// Map UI type → backend kind
type CodeKind = "qr" | "ean13" | "datamatrix" | "ean128";

const CODE_TYPES: CodeType[] = ["QR Code", "EAN-13", "DataMatrix", "Ean128"];

const CODE_TYPE_TO_KIND: Record<CodeType, CodeKind> = {
  "QR Code": "qr",
  "EAN-13": "ean13",
  DataMatrix: "datamatrix",
  Ean128: "ean128",
};

// For JSON multi mode
type MultiInputMode = "lines" | "json";

interface MultiResult {
  text: string;
  dataUrl: string;
  type: CodeType;
}

// -----------------------------
// Convert SVG string → PNG Blob
// -----------------------------
const svgToPng = async (svgString: string): Promise<Blob> => {
  return new Promise((resolve) => {
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;

      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
      }, "image/png");

      URL.revokeObjectURL(url);
    };

    img.src = url;
  });
};

// -----------------------------
// Helpers for data: URL → SVG
// -----------------------------
const dataUrlToSvgString = (dataUrl: string): string => {
  const [, encoded] = dataUrl.split(",", 2);
  if (!encoded) return "";
  try {
    return decodeURIComponent(encoded);
  } catch {
    return "";
  }
};

const copySvgFromDataUrl = async (dataUrl: string) => {
  const svg = dataUrlToSvgString(dataUrl);
  if (!svg) return;
  await navigator.clipboard.writeText(svg);
  toast("SVG copied to clipboard");
};

const downloadSvgFromDataUrl = (dataUrl: string, filename: string) => {
  const svg = dataUrlToSvgString(dataUrl);
  if (!svg) return;

  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.svg`;
  a.click();

  URL.revokeObjectURL(url);
  toast(`${filename || "code"}.svg has been downloaded`);
};

const downloadPngFromDataUrl = async (dataUrl: string, filename: string) => {
  const svg = dataUrlToSvgString(dataUrl);
  if (!svg) return;

  const blob = await svgToPng(svg);
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.png`;
  a.click();

  URL.revokeObjectURL(url);
  toast(`${filename || "code"}.png has been downloaded`);
};

// -----------------------------
// Helpers for UI: placeholders & sizing
// -----------------------------
const getSinglePlaceholder = (type: CodeType): string => {
  switch (type) {
    case "QR Code":
      return "https://example.com / free text";
    case "EAN-13":
      return "13-digit EAN (e.g. 5901234123457)";
    case "DataMatrix":
      return "Free text / GS1 payload";
    case "Ean128":
      return "(01)09501101530008(10)ABC123";
    default:
      return "Text to encode";
  }
};

const getMultiPlaceholderLines = (type: CodeType): string => {
  switch (type) {
    case "QR Code":
      return "One text/URL per line";
    case "EAN-13":
      return "One 13-digit EAN per line";
    case "DataMatrix":
      return "One value per line";
    case "Ean128":
      return "One GS1 string per line, e.g.\n(01)09501101530008(10)ABC123";
    default:
      return "Enter one value per line";
  }
};

const MULTI_JSON_PLACEHOLDER = `[
  { "text": "https://example.com", "type": "QR Code" },
  { "text": "5901234123457", "type": "EAN-13" },
  { "text": "(01)09501101530008(10)ABC123", "type": "Ean128" }
]`;

const getImageStyleForType = (type: CodeType, scale: number): CSSProperties => {
  const is2D = type === "QR Code" || type === "DataMatrix";
  const baseWidth = is2D ? 260 : 360;
  const width = baseWidth * scale;
  return {
    imageRendering: "pixelated",
    width,
    height: "auto",
  };
};

// Normalize type string from JSON → { uiType, kind }
const normalizeType = (
  raw: string
): { uiType: CodeType; kind: CodeKind } | null => {
  const v = raw.trim().toLowerCase();

  // Try match UI labels
  for (const uiType of CODE_TYPES) {
    if (uiType.toLowerCase() === v) {
      return { uiType, kind: CODE_TYPE_TO_KIND[uiType] };
    }
  }

  // Try match backend kind values
  const kindValues: CodeKind[] = ["qr", "ean13", "datamatrix", "ean128"];
  if (kindValues.includes(v as CodeKind)) {
    const kind = v as CodeKind;
    // find a UI label that maps to this kind
    const uiType = CODE_TYPES.find((t) => CODE_TYPE_TO_KIND[t] === kind);
    if (uiType) return { uiType, kind };
  }

  return null;
};

// -----------------------------
// Component
// -----------------------------
export default function CodeGenerator() {
  // Single mode
  const [singleText, setSingleText] = useState("");
  const [singleType, setSingleType] = useState<CodeType>("QR Code");

  const {
    src: singleSrc,
    error: singleError,
    generate: generateSingleBarcode,
  } = useBarcode();

  // Multi mode
  const [multiText, setMultiText] = useState("");
  const [multiType, setMultiType] = useState<CodeType>("QR Code");
  const [multiMode, setMultiMode] = useState<MultiInputMode>("lines");

  const [multiResults, setMultiResults] = useState<MultiResult[]>([]);
  const [selectedMulti, setSelectedMulti] = useState<number | null>(null);

  // Shared preview scale (0.5–3.0)
  const [previewScale, setPreviewScale] = useState(1); // 1 = 100%

  // ---------------------------
  // Generate a single code via useBarcode
  // ---------------------------
  const generateSingle = () => {
    if (!singleText.trim()) return;

    const kind = CODE_TYPE_TO_KIND[singleType];
    generateSingleBarcode(kind as CodeKind, singleText, "svg");
  };

  // ---------------------------
  // Generate multi list (direct invoke)
  // ---------------------------
  const generateMulti = async () => {
    if (!multiText.trim()) {
      setMultiResults([]);
      setSelectedMulti(null);
      return;
    }

    const results: MultiResult[] = [];

    try {
      if (multiMode === "lines") {
        // Old behavior: one value per line, same type for all
        const lines = multiText
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean);

        if (lines.length === 0) {
          setMultiResults([]);
          setSelectedMulti(null);
          return;
        }

        const kind = CODE_TYPE_TO_KIND[multiType];

        for (const item of lines) {
          const dataUrl = await invoke<string>("generate_barcode", {
            kind,
            data: item,
            format: "svg",
          });
          results.push({ text: item, dataUrl, type: multiType });
        }
      } else {
        // New behavior: JSON array
        let parsed: unknown;
        try {
          parsed = JSON.parse(multiText);
        } catch (e) {
          toast("Invalid JSON", {
            description: String(e),
          });
          return;
        }

        if (!Array.isArray(parsed)) {
          toast("JSON must be an array of objects");
          return;
        }

        if (parsed.length === 0) {
          toast("JSON array is empty");
          setMultiResults([]);
          setSelectedMulti(null);
          return;
        }

        for (const entry of parsed) {
          if (!entry || typeof entry !== "object") continue;

          const anyEntry = entry as { text?: unknown; type?: unknown };
          const text = String(anyEntry.text ?? "").trim();
          const typeRaw = String(anyEntry.type ?? "").trim();

          if (!text || !typeRaw) continue;

          const normalized = normalizeType(typeRaw);
          if (!normalized) {
            toast(`Unknown code type "${typeRaw}" – skipping entry.`);
            continue;
          }

          const dataUrl = await invoke<string>("generate_barcode", {
            kind: normalized.kind,
            data: text,
            format: "svg",
          });

          results.push({
            text,
            dataUrl,
            type: normalized.uiType,
          });
        }
      }
    } catch (e) {
      toast("Error while generating barcodes", {
        description: String(e),
      });
      return;
    }

    setMultiResults(results);
    setSelectedMulti(results.length > 0 ? 0 : null);
  };

  //
  // UI SECTION 1 — SINGLE GENERATION (LEFT SIDE)
  //
  const SingleLeftPanel = (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Single Code</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Type */}
        <select
          className="border rounded p-2"
          value={singleType}
          onChange={(e) => setSingleType(e.target.value as CodeType)}
        >
          {CODE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>

        {/* Text Input */}
        <Input
          placeholder={getSinglePlaceholder(singleType)}
          value={singleText}
          onChange={(e) => setSingleText(e.target.value)}
        />

        <Button onClick={generateSingle}>Generate</Button>

        {singleError && (
          <p className="text-sm text-red-500 mt-2">
            Error: {singleError.toString()}
          </p>
        )}

        {singleType === "Ean128" && (
          <p className="text-xs text-muted-foreground">
            Format: GS1 AIs like <code>(01)</code>, <code>(10)</code>, etc.
            Example: <code>(01)09501101530008(10)ABC123</code>
          </p>
        )}

        {singleType === "EAN-13" && (
          <p className="text-xs text-muted-foreground">
            Must be a 13-digit numeric EAN (with check digit).
          </p>
        )}
      </CardContent>
    </Card>
  );

  //
  // UI SECTION 2 — SINGLE PREVIEW (RIGHT SIDE)
  //
  const SingleRightPanel = (
    <Card className="h-full flex flex-col overflow-hidden bg-white">
      <CardHeader className="flex items-center justify-between gap-4">
        <CardTitle>Preview</CardTitle>
        {/* Size control */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Size</span>
          <input
            type="range"
            min={50}
            max={300}
            value={previewScale * 100}
            onChange={(e) => setPreviewScale(Number(e.target.value) / 100)}
            className="w-32"
          />
          <span className="text-xs text-muted-foreground">
            {Math.round(previewScale * 100)}%
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col items-center gap-4 flex-1 overflow-auto">
        {!singleSrc && (
          <p className="text-muted-foreground">No code generated.</p>
        )}

        {singleSrc && (
          <>
            {/* IMAGE PREVIEW */}
            <div className="border bg-white p-4">
              <img
                src={singleSrc}
                alt="Generated code"
                style={getImageStyleForType(singleType, previewScale)}
              />
            </div>

            <p className="text-sm text-muted-foreground break-all text-center">
              {singleText}
            </p>

            {/* ACTION BUTTONS */}
            <div className="flex flex-wrap gap-2 justify-center">
              <Button
                onClick={() =>
                  downloadSvgFromDataUrl(singleSrc, singleText || "code")
                }
                className="flex gap-2"
              >
                <Download size={16} /> SVG
              </Button>

              <Button
                onClick={() =>
                  downloadPngFromDataUrl(singleSrc, singleText || "code")
                }
                className="flex gap-2"
              >
                <Download size={16} /> PNG
              </Button>

              <Button
                onClick={() => copySvgFromDataUrl(singleSrc)}
                className="flex gap-2"
              >
                <Copy size={16} /> Copy SVG
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  //
  // UI SECTION 3 — MULTI MODE LEFT PANEL (INPUT + LIST)
  //
  const MultiLeftPanel = (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Multi Generation</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 flex-1 min-h-0">
        {/* Mode selector */}
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium">Input mode:</span>
          <select
            value={multiMode}
            onChange={(e) => setMultiMode(e.target.value as MultiInputMode)}
            className="border rounded px-2 py-1 text-xs"
          >
            <option value="lines">Lines</option>
            <option value="json">JSON</option>
          </select>
        </div>

        {/* Type (only for lines mode) */}
        <select
          className={cn(
            "border rounded p-2 text-sm",
            multiMode === "json" && "opacity-50 cursor-not-allowed"
          )}
          value={multiType}
          onChange={(e) => setMultiType(e.target.value as CodeType)}
          disabled={multiMode === "json"}
        >
          {CODE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>

        {/* Textarea */}
        <Textarea
          className="min-h-[140px] font-mono text-xs"
          placeholder={
            multiMode === "json"
              ? MULTI_JSON_PLACEHOLDER
              : getMultiPlaceholderLines(multiType)
          }
          value={multiText}
          onChange={(e) => setMultiText(e.target.value)}
        />

        <Button onClick={generateMulti}>Generate List</Button>

        {multiMode === "lines" && multiType === "Ean128" && (
          <p className="text-xs text-muted-foreground">
            Each line should be a GS1 string: e.g.
            <br />
            <code>(01)09501101530008(10)ABC123</code>
          </p>
        )}

        {multiMode === "json" && (
          <p className="text-xs text-muted-foreground">
            JSON format: array of {"{"}
            text, type
            {"}"} objects. Type can be:
            <code>"QR Code"</code>, <code>"EAN-13"</code>,{" "}
            <code>"DataMatrix"</code>, <code>"Ean128"</code> or backend values
            <code>"qr"</code>, <code>"ean13"</code>, <code>"datamatrix"</code>,{" "}
            <code>"ean128"</code>.
          </p>
        )}

        {/* LIST OF RESULTS */}
        <div className="border rounded p-2 overflow-auto flex-1 min-h-0 space-y-2">
          {multiResults.length === 0 && (
            <p className="text-muted-foreground">No items generated.</p>
          )}

          {multiResults.map((item, i) => (
            <div
              key={i}
              onClick={() => setSelectedMulti(i)}
              className={cn(
                "p-2 border rounded cursor-pointer bg-white hover:bg-muted transition flex items-center gap-2",
                selectedMulti === i && "bg-muted"
              )}
            >
              <div className="w-12 h-12 flex items-center justify-center bg-white">
                <img
                  src={item.dataUrl}
                  alt=""
                  style={{
                    imageRendering: "pixelated",
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                  }}
                />
              </div>
              <div className="flex flex-col">
                <span className="truncate text-xs font-mono">{item.text}</span>
                <span className="text-[10px] text-muted-foreground">
                  {item.type}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  //
  // UI SECTION 4 — MULTI RIGHT PREVIEW
  //
  const MultiRightPanel = (
    <Card className="h-full flex flex-col overflow-hidden bg-white">
      <CardHeader className="flex items-center justify-between gap-4">
        <CardTitle>Preview</CardTitle>
        {/* Size control (same state as single) */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Size</span>
          <input
            type="range"
            min={50}
            max={300}
            value={previewScale * 100}
            onChange={(e) => setPreviewScale(Number(e.target.value) / 100)}
            className="w-32"
          />
          <span className="text-xs text-muted-foreground">
            {Math.round(previewScale * 100)}%
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col items-center gap-4 flex-1 overflow-auto">
        {selectedMulti === null && (
          <p className="text-muted-foreground">Select an item.</p>
        )}

        {selectedMulti !== null && (
          <>
            <div className="border bg-white p-4">
              <img
                src={multiResults[selectedMulti].dataUrl}
                alt="Generated code"
                style={getImageStyleForType(
                  multiResults[selectedMulti].type,
                  previewScale
                )}
              />
            </div>

            <p className="text-sm text-muted-foreground break-all text-center">
              {multiResults[selectedMulti].text}
            </p>

            <div className="flex flex-wrap gap-2 justify-center">
              <Button
                onClick={() =>
                  downloadSvgFromDataUrl(
                    multiResults[selectedMulti].dataUrl,
                    multiResults[selectedMulti].text
                  )
                }
              >
                <Download size={16} /> SVG
              </Button>

              <Button
                onClick={() =>
                  downloadPngFromDataUrl(
                    multiResults[selectedMulti].dataUrl,
                    multiResults[selectedMulti].text
                  )
                }
              >
                <Download size={16} /> PNG
              </Button>

              <Button
                onClick={() =>
                  copySvgFromDataUrl(multiResults[selectedMulti].dataUrl)
                }
              >
                <Copy size={16} /> Copy SVG
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  //
  // FINAL RETURN — FULL PAGE LAYOUT
  //
  return (
    <div className="p-4 h-full w-full md:overflow-hidden overflow-y-auto">
      <Tabs defaultValue="single" className="h-full flex flex-col">
        <TabsList className="w-fit mb-4">
          <TabsTrigger value="single">Single</TabsTrigger>
          <TabsTrigger value="multi">Multi</TabsTrigger>
        </TabsList>

        {/* SINGLE MODE */}
        <TabsContent value="single" className="h-full flex-1">
          <div className="hidden md:block h-full">
            <ResizablePanelGroup direction="horizontal" className="h-full">
              <ResizablePanel defaultSize={40} minSize={30}>
                <div className="h-full pr-3 overflow-hidden">
                  {SingleLeftPanel}
                </div>
              </ResizablePanel>

              <ResizableHandle />

              <ResizablePanel defaultSize={60} minSize={30}>
                <div className="h-full pl-3 overflow-hidden">
                  {SingleRightPanel}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>

          {/* MOBILE */}
          <div className="block md:hidden space-y-4">
            {SingleLeftPanel}
            {SingleRightPanel}
          </div>
        </TabsContent>

        {/* MULTI MODE */}
        <TabsContent value="multi" className="h-full flex-1">
          <div className="hidden md:block h-full">
            <ResizablePanelGroup direction="horizontal" className="h-full">
              <ResizablePanel defaultSize={45} minSize={30}>
                <div className="h-full pr-3 overflow-hidden">
                  {MultiLeftPanel}
                </div>
              </ResizablePanel>

              <ResizableHandle />

              <ResizablePanel defaultSize={55} minSize={30}>
                <div className="h-full pl-3 overflow-hidden">
                  {MultiRightPanel}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>

          {/* MOBILE */}
          <div className="block md:hidden space-y-4">
            {MultiLeftPanel}
            {MultiRightPanel}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
