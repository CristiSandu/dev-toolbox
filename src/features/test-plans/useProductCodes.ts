import { useCallback, useEffect, useRef, useState } from "react";
import type { GeneratedCode } from "@/lib/code-generation";
import { generateProductCode } from "./product-code";
import { generationKey, type Product } from "./model";

export interface ProductCode {
  key: string;
  result?: GeneratedCode;
  error?: string;
}
export function useProductCodes(
  products: Product[],
  selected: Product | undefined,
  active: boolean,
) {
  const [codes, setCodes] = useState<Record<string, ProductCode>>({});
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState("");
  const token = useRef(0),
    running = useRef(false),
    live = useRef(products);
  live.current = products;
  const fingerprint = JSON.stringify(
    products.map((product) => [product.id, generationKey(product)]),
  );
  useEffect(() => {
    token.current++;
    running.current = false;
    setBusy(false);
    setProgress("");
    // Remove obsolete source results so deleted/replaced lists do not retain images.
    setCodes((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id, code]) =>
          live.current.some(
            (product) =>
              product.id === id && generationKey(product) === code.key,
          ),
        ),
      ),
    );
    return () => {
      token.current++;
      running.current = false;
    };
  }, [fingerprint]);
  const generate = useCallback(async (items: Product[]) => {
    if (running.current || !items.length) return;
    const run = ++token.current;
    running.current = true;
    setBusy(true);
    try {
      for (let index = 0; index < items.length; index++) {
        if (run !== token.current) return;
        const product = items[index],
          key = generationKey(product);
        setProgress(`${index + 1} of ${items.length}`);
        let code: ProductCode;
        try {
          code = {
            key,
            result: await generateProductCode(product),
          };
        } catch (error) {
          code = {
            key,
            error: String(error instanceof Error ? error.message : error),
          };
        }
        if (run !== token.current) return;
        if (
          live.current.some(
            (item) => item.id === product.id && generationKey(item) === key,
          )
        )
          setCodes((current) => ({ ...current, [product.id]: code }));
      }
    } finally {
      if (run === token.current) {
        running.current = false;
        setBusy(false);
        setProgress("");
      }
    }
  }, []);
  const selectedCode =
    selected && codes[selected.id]?.key === generationKey(selected)
      ? codes[selected.id]
      : undefined;
  useEffect(() => {
    if (active && selected && !selectedCode && !busy) void generate([selected]);
  }, [active, selected, selectedCode, busy, generate]);
  return { codes, busy, progress, generate, selectedCode };
}
