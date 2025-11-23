import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

type CodeKind = "qr" | "datamatrix" | "ean13" | "ean128";
type ImageFormat = "svg" | "png";

export function useBarcode() {
    const [src, setSrc] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function generate(kind: CodeKind, data: string, format: ImageFormat = "svg") {
        setError(null);
        try {
            const result = await invoke<string>("generate_barcode", {
                kind,
                data,
                format,
            });
            setSrc(result);
        } catch (e: any) {
            setError(e?.toString() ?? "Failed to generate barcode");
        }
    }

    return { src, error, generate };
}
