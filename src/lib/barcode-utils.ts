"use client";

import type { CSSProperties } from "react";
import { toast } from "sonner";
import {
    CodeType,
} from "@/components/code-generator/codegen-types";

// ---------- SVG → PNG ----------
export const svgToPng = async (svgString: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
        const url = URL.createObjectURL(svgBlob);

        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width * 2;
            canvas.height = img.height * 2;

            const ctx = canvas.getContext("2d");
            if (!ctx) { URL.revokeObjectURL(url); reject(new Error("Could not prepare PNG export.")); return; }
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            canvas.toBlob((blob) => {
                if (blob) resolve(blob); else reject(new Error("Could not create the PNG image."));
            }, "image/png");

            URL.revokeObjectURL(url);
        };

        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read this code image. Generate it again.")); };
        img.src = url;
    });
};

// ---------- data:URL helpers ----------
export const dataUrlToSvgString = (dataUrl: string): string => {
    if (!dataUrl || !dataUrl.includes(",")) return "";
    
    // Handle both formats: data:image/svg+xml;utf8,<encoded> and data:image/svg+xml,<encoded>
    const parts = dataUrl.split(",");
    if (parts.length < 2) return "";
    
    const encoded = parts.slice(1).join(","); // Join in case SVG contains commas
    if (!encoded) return "";
    
    try {
        // Decode URL-encoded SVG
        return decodeURIComponent(encoded);
    } catch (err) {
        // If decoding fails, try returning as-is (might already be decoded)
        console.warn("Failed to decode SVG data URL:", err);
        return encoded;
    }
};

export const isPngDataUrl = (dataUrl: string): boolean => {
    return dataUrl.startsWith("data:image/png;base64,");
};

export const isSvgDataUrl = (dataUrl: string): boolean => {
    return dataUrl.startsWith("data:image/svg+xml");
};

export const copySvgFromDataUrl = async (dataUrl: string) => {
    if (isPngDataUrl(dataUrl)) {
        throw new Error("SVG is not available. Generate the code again.");
    }
    const svg = dataUrlToSvgString(dataUrl);
    if (!svg) throw new Error("The generated SVG is empty. Generate the code again.");
    await navigator.clipboard.writeText(svg);
    toast("SVG copied to clipboard");
};

export const downloadSvgFromDataUrl = (dataUrl: string, filename?: string) => {
    // Handle PNG data URLs - can't convert to SVG, so show error
    if (isPngDataUrl(dataUrl)) {
        throw new Error("SVG is not available. Generate the code again.");
    }

    const svg = dataUrlToSvgString(dataUrl);
    if (!svg) throw new Error("The generated SVG is empty. Generate the code again.");

    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename || "code"}.svg`;
    a.click();

    URL.revokeObjectURL(url);
    toast(`${filename || "code"}.svg has been downloaded`);
};

export const downloadPngFromDataUrl = async (
    dataUrl: string,
    filename?: string
) => {
    // Handle PNG data URLs directly
    if (isPngDataUrl(dataUrl)) {
        const [, base64] = dataUrl.split(",", 2);
        if (!base64) return;

        // Convert base64 to blob
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "image/png" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `${filename || "code"}.png`;
        a.click();

        URL.revokeObjectURL(url);
        toast(`${filename || "code"}.png has been downloaded`);
        return;
    }

    // Handle SVG data URLs - convert to PNG
    const svg = dataUrlToSvgString(dataUrl);
    if (!svg) throw new Error("The generated SVG is empty. Generate the code again.");

    const blob = await svgToPng(svg);
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename || "code"}.png`;
    a.click();

    URL.revokeObjectURL(url);
    toast(`${filename || "code"}.png has been downloaded`);
};

// ---------- Placeholders ----------
export const getSinglePlaceholder = (type: CodeType): string => {
    switch (type) {
        case "QR Code":
            return "https://example.com / free text";
        case "EAN-13":
            return "12 or 13 digits (e.g. 5901234123457)";
        case "DataMatrix":
            return "Free text / GS1 payload";
        case "Code128":
            return "(01)09501101530008(10)ABC123";
        default:
            return "Text to encode";
    }
};

export const getMultiPlaceholderLines = (type: CodeType): string => {
    switch (type) {
        case "QR Code":
            return "One text/URL per line";
        case "EAN-13":
            return "One 12- or 13-digit EAN per line";
        case "DataMatrix":
            return "One value per line";
        case "Code128":
            return "One GS1 string per line, e.g.\n(01)09501101530008(10)ABC123";
        default:
            return "Enter one value per line";
    }
};

export const MULTI_JSON_PLACEHOLDER = `[
  { "text": "https://example.com", "type": "QR Code", "description": "Example website" },
  { "text": "5901234123457", "type": "EAN-13" },
  { "text": "(01)09501101530008(10)ABC123", "type": "Ean128", "description": "GS1 barcode" }
]`;

// ---------- Image sizing ----------
export const getImageStyleForType = (
    type: CodeType,
    scale: number
): CSSProperties => {
    const is2D = type === "QR Code" || type === "DataMatrix";
    const baseWidth = is2D ? 260 : 360;
    const width = baseWidth * scale;
    return {
        imageRendering: "pixelated",
        width,
        height: "auto",
    };
};

// ---------- Type normalizer ----------
export { normalizeType } from "./code-input";

export { isSamePayload } from "./code-input";
