"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy", onCopied, className = "" }: { text: string; label?: string; onCopied?: () => void; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`btn btn-secondary ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          onCopied?.();
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* clipboard blocked; the text is visible to select */
        }
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}
