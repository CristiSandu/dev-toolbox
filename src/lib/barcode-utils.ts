"use client";

import type { CSSProperties } from "react";
import { toast } from "sonner";
import {
    CODE_TYPE_TO_KIND,
    CODE_TYPES,
    CodeKind,
    CodeType,
    HistoryPayload,
} from "@/components/code-generator/codegen-types";

// ---------- SVG → PNG ----------
export const svgToPng = async (svgString: string): Promise<Blob> => {
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

// ---------- data:URL helpers ----------
export const dataUrlToSvgString = (dataUrl: string): string => {
    const [, encoded] = dataUrl.split(",", 2);
    if (!encoded) return "";
    try {
        return decodeURIComponent(encoded);
    } catch {
        return "";
    }
};

export const copySvgFromDataUrl = async (dataUrl: string) => {
    const svg = dataUrlToSvgString(dataUrl);
    if (!svg) return;
    await navigator.clipboard.writeText(svg);
    toast("SVG copied to clipboard");
};

export const downloadSvgFromDataUrl = (dataUrl: string, filename?: string) => {
    const svg = dataUrlToSvgString(dataUrl);
    if (!svg) return;

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
    const svg = dataUrlToSvgString(dataUrl);
    if (!svg) return;

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
            return "13-digit EAN (e.g. 5901234123457)";
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
            return "One 13-digit EAN per line";
        case "DataMatrix":
            return "One value per line";
        case "Code128":
            return "One GS1 string per line, e.g.\n(01)09501101530008(10)ABC123";
        default:
            return "Enter one value per line";
    }
};

export const MULTI_JSON_PLACEHOLDER = `[
  { "text": "https://example.com", "type": "QR Code" },
  { "text": "5901234123457", "type": "EAN-13" },
  { "text": "(01)09501101530008(10)ABC123", "type": "Ean128" }
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
export const normalizeType = (
    raw: string
): { uiType: CodeType; kind: CodeKind } | null => {
    const v = raw.trim().toLowerCase();

    for (const uiType of CODE_TYPES) {
        if (uiType.toLowerCase() === v) {
            return { uiType, kind: CODE_TYPE_TO_KIND[uiType] };
        }
    }

    const kindValues: CodeKind[] = ["qr", "ean13", "datamatrix", "code128"];
    if (kindValues.includes(v as CodeKind)) {
        const kind = v as CodeKind;
        const uiType = CODE_TYPES.find((t) => CODE_TYPE_TO_KIND[t] === kind)!;
        return { uiType, kind };
    }

    return null;
};

export const isSamePayload = (
    a: HistoryPayload | null,
    b: HistoryPayload | null
): boolean => {
    if (!a || !b) return false;
    return JSON.stringify(a) === JSON.stringify(b);
};