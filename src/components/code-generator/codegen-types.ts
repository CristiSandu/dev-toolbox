export type CodeType = "QR Code" | "EAN-13" | "DataMatrix" | "Code128";

export type CodeKind = "qr" | "ean13" | "datamatrix" | "code128";

export const CODE_TYPES: CodeType[] = [
    "QR Code",
    "EAN-13",
    "DataMatrix",
    "Code128",
];

export const CODE_TYPE_TO_KIND: Record<CodeType, CodeKind> = {
    "QR Code": "qr",
    "EAN-13": "ean13",
    DataMatrix: "datamatrix",
    Code128: "code128",
};

export type MultiInputMode = "lines" | "json";

export type HistoryMode = "single" | "multi";

export interface HistoryPayload {
    mode: HistoryMode;

    // single
    singleType?: CodeType;
    singleText?: string;

    // multi
    multiMode?: MultiInputMode;
    multiType?: CodeType;
    multiText?: string;
}
