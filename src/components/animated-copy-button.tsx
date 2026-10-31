import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

export default function AnimatedCopyButton({ text, label = "Copy text" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text); setCopied(true);
      clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1600);
    } catch { toast.error("Could not copy. Select the text and use Cmd/Ctrl+C."); }
  };
  return <Button variant="ghost" size="sm" disabled={!text} onClick={() => void copy()} aria-label={copied ? `${label}: copied` : label}>
    {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}<span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
  </Button>;
}
