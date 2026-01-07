"use client";

import { useEffect, useState, useMemo } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Download, Search, X, Filter, ArrowUp, ArrowDown, ArrowUpDown, MoreVertical } from "lucide-react";
import { cn, sanitizeBarcodeInput } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  CODE_TYPES,
  CODE_TYPE_TO_KIND,
  CodeKind,
  CodeType,
  HistoryPayload,
  MultiInputMode,
} from "@/components/code-generator/codegen-types";
import {
  copySvgFromDataUrl,
  downloadPngFromDataUrl,
  downloadSvgFromDataUrl,
  getImageStyleForType,
  getMultiPlaceholderLines,
  isSamePayload,
  MULTI_JSON_PLACEHOLDER,
  normalizeType,
} from "@/lib/barcode-utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Input } from "../ui/input";
import { AnimatedActionButton } from "../animated-action-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface MultiCodeTabProps {
  multiText: string;
  multiType: CodeType;
  multiMode: MultiInputMode;
  lastSavedMulti: HistoryPayload | null;
  refreshToken: number;
  onChangeText: (value: string) => void;
  onChangeType: (value: CodeType) => void;
  onChangeMode: (value: MultiInputMode) => void;
  onSaveHistory: (payload: HistoryPayload) => Promise<void>;
  onLastSavedMulti: (value: HistoryPayload | null) => void;
}

interface MultiResult {
  text: string;
  dataUrl: string;
  svgDataUrl?: string; // Store SVG separately for Code128
  type: CodeType;
  description: string;
}

export function MultiCodeTab(props: MultiCodeTabProps) {
  const {
    multiText,
    multiType,
    multiMode,
    lastSavedMulti,
    refreshToken,
    onChangeText,
    onChangeType,
    onChangeMode,
    onSaveHistory,
    onLastSavedMulti,
  } = props;

  useEffect(() => {
    generateMulti();
  }, [refreshToken]);

  const [results, setResults] = useState<MultiResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"=" | "asc" | "desc">("=");
  const [selectedTypes, setSelectedTypes] = useState<Set<CodeType>>(
    new Set(CODE_TYPES)
  );

  // Get code types that are actually present in the results
  const availableTypes = useMemo(
    () => new Set<CodeType>(results.map((item) => item.type)),
    [results]
  );

  // Update selectedTypes when results change to only include available types
  useEffect(() => {
    if (availableTypes.size > 0) {
      setSelectedTypes((prev) => {
        const newSet = new Set<CodeType>();
        prev.forEach((type) => {
          if (availableTypes.has(type)) {
            newSet.add(type);
          }
        });
        // If no types are selected (because they were filtered out), select all available
        if (newSet.size === 0) {
          return new Set(availableTypes);
        }
        return newSet;
      });
    }
  }, [availableTypes]);

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) {
      return <>{text}</>;
    }

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let index = lowerText.indexOf(lowerQuery, lastIndex);

    while (index !== -1) {
      // Add text before match
      if (index > lastIndex) {
        parts.push(text.substring(lastIndex, index));
      }
      // Add highlighted match
      parts.push(
        <mark
          key={index}
          className="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded"
        >
          {text.substring(index, index + query.length)}
        </mark>
      );
      lastIndex = index + query.length;
      index = lowerText.indexOf(lowerQuery, lastIndex);
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return <>{parts}</>;
  };

  const generateMulti = async () => {
    if (!multiText.trim()) {
      setResults([]);
      setSelectedIndex(null);
      return;
    }

    const newResults: MultiResult[] = [];

    try {
      if (multiMode === "lines") {
        const lines = multiText
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean);

        if (lines.length === 0) {
          setResults([]);
          setSelectedIndex(null);
          return;
        }

        const kind = CODE_TYPES.includes(multiType)
          ? normalizeType(multiType)?.kind ?? "qr"
          : "qr";

        const format = multiType === "Code128" ? "png" : "svg";

        for (const item of lines) {
          const dataUrl = await invoke<string>("generate_barcode", {
            kind: kind,
            data: sanitizeBarcodeInput(item),
            format: format,
          });
          
          // For Code128, also generate SVG in the background for copying
          let svgDataUrl: string | undefined;
          if (multiType === "Code128") {
            try {
              svgDataUrl = await invoke<string>("generate_barcode", {
                kind: kind,
                data: sanitizeBarcodeInput(item),
                format: "svg",
              });
            } catch (svgErr) {
              // Silently fail - SVG is just for copying
              console.warn("Failed to generate SVG for Code128:", svgErr);
            }
          }

          newResults.push({ text: item, dataUrl, svgDataUrl, type: multiType, description: "" });
        }
      } else {
        let parsed: unknown;
        try {
          parsed = JSON.parse(multiText);
        } catch (e) {
          toast("Invalid JSON", { description: String(e) });
          return;
        }

        if (!Array.isArray(parsed)) {
          toast("JSON must be an array of objects");
          return;
        }

        if (parsed.length === 0) {
          toast("JSON array is empty");
          setResults([]);
          setSelectedIndex(null);
          return;
        }

        for (const entry of parsed) {
          if (!entry || typeof entry !== "object") continue;

          const anyEntry = entry as { text?: unknown; type?: unknown; description?: unknown };
          const text = String(anyEntry.text ?? "").trim();
          const typeRaw = String(anyEntry.type ?? "").trim();
          const description = String(anyEntry.description ?? "").trim();

          if (!text || !typeRaw) continue;

          const normalized = normalizeType(typeRaw);
          if (!normalized) {
            toast(`Unknown code type "${typeRaw}" – skipping entry.`);
            continue;
          }

          const formatForType = (t: CodeType) =>
            t === "Code128" ? "png" : "svg";

          const dataUrl = await invoke<string>("generate_barcode", {
            kind: normalized.kind,
            data: sanitizeBarcodeInput(text),
            format: formatForType(normalized.uiType),
          });

          // For Code128, also generate SVG in the background for copying
          let svgDataUrl: string | undefined;
          if (normalized.uiType === "Code128") {
            try {
              svgDataUrl = await invoke<string>("generate_barcode", {
                kind: normalized.kind,
                data: sanitizeBarcodeInput(text),
                format: "svg",
              });
            } catch (svgErr) {
              // Silently fail - SVG is just for copying
              console.warn("Failed to generate SVG for Code128:", svgErr);
            }
          }

          newResults.push({
            text,
            dataUrl,
            svgDataUrl,
            type: normalized.uiType,
            description,
          });
        }
      }
    } catch (e) {
      toast("Error while generating barcodes", { description: String(e) });
      return;
    }

    setResults(newResults);
    setSelectedIndex(newResults.length > 0 ? 0 : null);

    const payload: HistoryPayload = {
      mode: "multi",
      multiMode,
      multiType,
      multiText,
    };

    // ❗ Only save if different from last saved multi payload
    if (!isSamePayload(lastSavedMulti, payload)) {
      await onSaveHistory(payload);
      onLastSavedMulti(payload);
    }
  };

  const Left = (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Multi Generation</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 flex-1 min-h-0">
        <div className="flex-col w-full gap-2 space-y-2">
          <div className="flex items-center gap-2 text-xs flex-1">
            <span className="text-sm font-medium">Input mode:</span>
            <Select
              value={multiMode}
              onValueChange={(e) => onChangeMode(e as MultiInputMode)}
            >
              <SelectTrigger>
                <SelectValue className="w-60" placeholder="Code type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lines">Lines</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-xs flex-1">
            <span className="text-sm font-medium">Code type:</span>
            <Select
              value={multiType}
              disabled={multiMode === "json"}
              onValueChange={(e) => onChangeType(e as CodeType)}
            >
              <SelectTrigger>
                <SelectValue
                  className={cn(
                    "border rounded p-2 text-sm",
                    multiMode === "json" && "opacity-50 cursor-not-allowed"
                  )}
                  placeholder="Code type"
                />
              </SelectTrigger>

              <SelectContent>
                {CODE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Textarea
          className="min-h-[140px] font-mono text-xs"
          placeholder={
            multiMode === "json"
              ? MULTI_JSON_PLACEHOLDER
              : getMultiPlaceholderLines(multiType)
          }
          value={multiText}
          onChange={(e) => onChangeText(e.target.value)}
        />

        <Button onClick={generateMulti}>Generate List</Button>

        {multiMode === "lines" && multiType === "Code128" && (
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
            {"}"} objects (optional <code>description</code> field). Type can be:
            <code>"QR Code"</code>, <code>"EAN-13"</code>,{" "}
            <code>"DataMatrix"</code>, <code>"Ean128"</code> or backend values{" "}
            <code>"qr"</code>, <code>"ean13"</code>, <code>"datamatrix"</code>,{" "}
            <code>"ean128"</code>.
          </p>
        )}

        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search codes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn("pl-8", searchQuery && "pr-8")}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-20">
                  <Filter className="h-4 w-4 mr-2" />
                  {availableTypes.size === 0
                    ? "None"
                    : selectedTypes.size === availableTypes.size
                    ? "All"
                    : `${selectedTypes.size}`}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuLabel>Code Types</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availableTypes.size === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No codes available
                  </div>
                ) : (
                  Array.from(availableTypes)
                    .sort()
                    .map((type) => (
                      <DropdownMenuCheckboxItem
                        key={type}
                        checked={selectedTypes.has(type)}
                        onCheckedChange={(checked) => {
                          const newSet = new Set(selectedTypes);
                          if (checked) {
                            newSet.add(type);
                          } else {
                            newSet.delete(type);
                          }
                          setSelectedTypes(newSet);
                        }}
                      >
                        {type}
                      </DropdownMenuCheckboxItem>
                    ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                if (sortOrder === "=") setSortOrder("asc");
                else if (sortOrder === "asc") setSortOrder("desc");
                else setSortOrder("=");
              }}
              className="w-9 h-9"
              aria-label={
                sortOrder === "="
                  ? "Original order"
                  : sortOrder === "asc"
                  ? "Sort descending"
                  : "Sort ascending"
              }
            >
              {sortOrder === "=" ? (
                <ArrowUpDown className="h-4 w-4" />
              ) : sortOrder === "asc" ? (
                <ArrowUp className="h-4 w-4" />
              ) : (
                <ArrowDown className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="border rounded p-2 overflow-auto flex-1 min-h-0 space-y-2">
            {(() => {
              // Filter results with original indices
              const filteredWithIndices = results
                .map((item, index) => ({ item, originalIndex: index }))
                .filter(({ item }) => {
                  // Text/type search filter
                  const matchesSearch =
                    item.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    item.type.toLowerCase().includes(searchQuery.toLowerCase());
                  
                  // Code type filter
                  const matchesType = selectedTypes.has(item.type);
                  
                  return matchesSearch && matchesType;
                });

              // Sort by code text or preserve original order
              const sorted = [...filteredWithIndices].sort((a, b) => {
                if (sortOrder === "=") {
                  // Preserve original order
                  return a.originalIndex - b.originalIndex;
                } else {
                  // Sort by code text
                  const comparison = a.item.text.localeCompare(b.item.text);
                  return sortOrder === "asc" ? comparison : -comparison;
                }
              });

              if (sorted.length === 0) {
                return (
                  <p className="text-muted-foreground">
                    {results.length === 0
                      ? "No items generated."
                      : "No items match your search."}
                  </p>
                );
              }

              return sorted.map(({ item, originalIndex }) => (
                <div
                  key={originalIndex}
                  onClick={() => setSelectedIndex(originalIndex)}
                  className={cn(
                    "group p-2 border rounded cursor-pointer bg-card hover:bg-muted transition flex items-center gap-2",
                    selectedIndex === originalIndex && "bg-muted"
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
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="truncate text-xs font-mono">
                      {highlightText(item.text, searchQuery)}
                    </span>
                    <div className="flex items-center justify-start gap-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        {highlightText(item.type, searchQuery)}
                      </span>
                      {item.description && (
                        <>
                          <span className="mx-1 text-[10px] text-muted-foreground select-none">|</span>
                          <span className="text-[10px] text-muted-foreground italic">
                            {highlightText(item.description, searchQuery)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div 
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          onClick={async () => {
                            // For Code128, generate SVG on-demand if currently showing PNG
                            if (item.type === "Code128" && item.dataUrl?.startsWith("data:image/png;base64,")) {
                              const kind: CodeKind = CODE_TYPE_TO_KIND[item.type];
                              try {
                                const resultSvg = await invoke<string>("generate_barcode", {
                                  kind,
                                  data: sanitizeBarcodeInput(item.text),
                                  format: "svg",
                                });
                                downloadSvgFromDataUrl(resultSvg, item.text);
                              } catch (err: any) {
                                toast.error(err?.toString() ?? "Failed to generate SVG");
                              }
                            } else {
                              downloadSvgFromDataUrl(item.dataUrl, item.text);
                            }
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download SVG
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            downloadPngFromDataUrl(item.dataUrl, item.text);
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download PNG
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={async () => {
                            // For Code128, use pre-generated SVG if available
                            if (item.type === "Code128" && item.svgDataUrl) {
                              await copySvgFromDataUrl(item.svgDataUrl);
                            } else {
                              await copySvgFromDataUrl(item.dataUrl);
                            }
                          }}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy SVG
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const Right = (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="flex items-center justify-between gap-4">
        <CardTitle>Preview</CardTitle>
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
        {selectedIndex === null && (
          <p className="text-muted-foreground">Select an item.</p>
        )}

        {selectedIndex !== null && results[selectedIndex] && (
          <>
            <div className="border bg-white p-4">
              <img
                src={results[selectedIndex].dataUrl}
                alt="Generated code"
                style={getImageStyleForType(
                  results[selectedIndex].type,
                  previewScale
                )}
              />
            </div>

            <p className="text-sm text-muted-foreground break-all text-center">
              {results[selectedIndex].text}
            </p>

            {results[selectedIndex].description && (
              <p className="text-xs text-muted-foreground break-all text-center italic">
                {results[selectedIndex].description}
              </p>
            )}

            <div className="flex flex-wrap gap-2 justify-center">
              <AnimatedActionButton
                onAction={async () => {
                  const result = results[selectedIndex];
                  // For Code128, generate SVG on-demand if currently showing PNG
                  if (result.type === "Code128" && result.dataUrl?.startsWith("data:image/png;base64,")) {
                    const kind: CodeKind = CODE_TYPE_TO_KIND[result.type];
                    try {
                      const resultSvg = await invoke<string>("generate_barcode", {
                        kind,
                        data: sanitizeBarcodeInput(result.text),
                        format: "svg",
                      });
                      downloadSvgFromDataUrl(resultSvg, result.text);
                    } catch (e: any) {
                      toast.error(e?.toString() ?? "Failed to generate SVG");
                    }
                  } else {
                    downloadSvgFromDataUrl(result.dataUrl, result.text);
                  }
                }}
                label="SVG"
                Icon={Download}
                doneLabel="Saved"
              />

              <AnimatedActionButton
                onAction={() =>
                  downloadPngFromDataUrl(
                    results[selectedIndex].dataUrl,
                    results[selectedIndex].text
                  )
                }
                label="PNG"
                Icon={Download}
                doneLabel="Saved"
              />

              <AnimatedActionButton
                onAction={async () => {
                  const result = results[selectedIndex];
                  // For Code128, use pre-generated SVG if available
                  if (result.type === "Code128" && result.svgDataUrl) {
                    await copySvgFromDataUrl(result.svgDataUrl);
                  } else {
                    await copySvgFromDataUrl(result.dataUrl);
                  }
                }}
                label="Copy SVG"
                Icon={Copy}
                doneLabel="Copied"
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <>
      <div className="hidden md:block h-full">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={45} minSize={30}>
            <div className="h-full pr-3 overflow-hidden">{Left}</div>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={55} minSize={30}>
            <div className="h-full pl-3 overflow-hidden">{Right}</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <div className="block md:hidden space-y-4">
        {Left}
        {Right}
      </div>
    </>
  );
}
