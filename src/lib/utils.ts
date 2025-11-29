import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sanitizes barcode input for Code128, EAN13, etc.
 * - Removes control characters like \n, \r, \t
 * - Removes non-printable or non-ASCII chars
 * - Optionally uppercases or trims based on use case
 */
export function sanitizeBarcodeInput(raw: string): string {
  if (!raw) return "";

  return raw
    .replace(/[\r\n\t]/g, "") // remove newlines & tabs
    .replace(/[^\x20-\x7E]/g, "") // keep only printable ASCII
    .trim(); // remove leading/trailing spaces
}
