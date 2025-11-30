"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

type AnimatedActionButtonProps = {
  onAction: () => void | Promise<void>;
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
  doneLabel?: string;
};

export function AnimatedActionButton({
  onAction,
  label,
  Icon,
  doneLabel = "Done",
}: AnimatedActionButtonProps) {
  const [done, setDone] = useState(false);

  const handleClick = async () => {
    await onAction();
    setDone(true);
    setTimeout(() => setDone(false), 1200);
  };

  return (
    <Button
      onClick={handleClick}
      className="relative flex items-center gap-2 overflow-hidden active:scale-95 transition-transform"
    >
      {/* Normal state */}
      <span
        className={`flex items-center gap-2 transition-all duration-200 ${
          done ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        <Icon size={16} />
        <span>{label}</span>
      </span>

      {/* Done state */}
      <span
        className={`absolute inset-0 flex items-center justify-center gap-2 transition-all duration-200 ${
          done
            ? "translate-y-0 opacity-100 text-emerald-500"
            : "translate-y-full opacity-0"
        }`}
      >
        <Check size={16} />
        <span>{doneLabel}</span>
      </span>
    </Button>
  );
}
