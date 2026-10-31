import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

type Props = { onAction: () => void | Promise<void>; label: string; Icon: React.ComponentType<{ size?: number }>; doneLabel?: string };
export function AnimatedActionButton({ onAction, label, Icon, doneLabel = "Done" }: Props) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const run = async () => {
    setState("busy");
    try { await onAction(); setState("done"); clearTimeout(timer.current); timer.current = setTimeout(() => setState("idle"), 1600); }
    catch (error) { setState("idle"); toast.error(`Could not ${label.toLowerCase()}`, { description: String(error) }); }
  };
  return <Button variant="outline" onClick={() => void run()} disabled={state === "busy"} aria-live="polite">
    {state === "done" ? <Check size={16} /> : state === "busy" ? <LoaderCircle size={16} className="animate-spin" /> : <Icon size={16} />}{state === "done" ? doneLabel : label}
  </Button>;
}
