"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

function AnimatedCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    if (!text) return;

    await navigator.clipboard.writeText(text);
    setCopied(true);

    // revert back to Copy icon after 1.2s
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <Button
      size="icon"
      onClick={handleClick}
      className="relative overflow-hidden"
    >
      {/* Copy icon */}
      <Copy
        size={16}
        className={`transition-all duration-200 ${
          copied ? "translate-y-[-150%] opacity-0" : "translate-y-0 opacity-100"
        }`}
      />

      {/* Check icon */}
      <Check
        size={16}
        className={`absolute inset-0 m-auto transition-all duration-200 ${
          copied
            ? "translate-y-0 opacity-100 text-emerald-500"
            : "translate-y-full opacity-0"
        }`}
      />
    </Button>
  );
}

export default AnimatedCopyButton;
