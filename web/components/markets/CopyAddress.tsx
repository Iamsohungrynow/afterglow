"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";
import { short } from "@/lib/format";

export function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="num text-fg-2" title={address}>
        {short(address)}
      </span>
      <button
        type="button"
        onClick={() => navigator.clipboard?.writeText(address).then(() => setCopied(true), () => {})}
        className="inline-flex size-6 items-center justify-center rounded-[6px] text-fg-3 transition-colors hover:bg-white/[0.05] hover:text-fg-2"
        aria-label={copied ? "Address copied" : "Copy market address"}
      >
        {copied ? <Check size={13} className="text-fg" /> : <Copy size={13} />}
      </button>
    </span>
  );
}
