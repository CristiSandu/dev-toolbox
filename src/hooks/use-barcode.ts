import { sanitizeBarcodeInput } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

type CodeKind = "qr" | "datamatrix" | "ean13" | "code128";
type ImageFormat = "svg" | "png";

export function useBarcode() {
    const [src, setSrc] = useState<string | null>(null);
    const [svgSrc, setSvgSrc] = useState<string | null>(null); // Store SVG separately for Code128
    const [error, setError] = useState<string | null>(null);

    async function generate(kind: CodeKind, data: string, format: ImageFormat = "svg") {
        setError(null);
        try {
            const result = await invoke<string>("generate_barcode", {
                kind,
                data: sanitizeBarcodeInput(data),
                format,
            });
            setSrc(result);
            
            // For Code128 with PNG format, also generate SVG in the background for copying
            if (kind === "code128" && format === "png") {
                try {
                    const svgResult = await invoke<string>("generate_barcode", {
                        kind,
                        data: sanitizeBarcodeInput(data),
                        format: "svg",
                    });
                    setSvgSrc(svgResult);
                } catch (svgErr) {
                    // Silently fail SVG generation - it's just for copying
                    console.warn("Failed to generate SVG for Code128:", svgErr);
                    setSvgSrc(null);
                }
            } else {
                // For other formats or SVG format, clear svgSrc
                setSvgSrc(null);
            }
        } catch (e: any) {
            setError(e?.toString() ?? "Failed to generate barcode");
        }
    }

    return { src, svgSrc, error, generate };
}
