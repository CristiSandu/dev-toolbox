import { useRef, useState, useEffect } from "react";
import { useDraftState } from "@/hooks/use-draft-state";
import { generateCode, type GeneratedCode } from "@/lib/code-generation";
import type { CodeType } from "@/components/code-generator/codegen-types";
import { isTauri } from "@tauri-apps/api/core";

export function useBarcode() {
  const [result, setResult] = useDraftState<GeneratedCode | null>("code.singleResult", null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const running = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const generate = async (type: CodeType, text: string) => {
    if (running.current) return null;
    if (!isTauri()) { setError("Open the desktop app to generate codes locally."); return null; }
    running.current = true; setBusy(true); setError("");
    try {
      const next = await generateCode(type, text);
      if (!mounted.current) return null;
      setResult(next); return next;
    } catch (error) { if (mounted.current) setError(String(error)); return null; }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  };
  return { result, busy, error, generate };
}
