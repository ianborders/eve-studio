import { useEffect, useRef, useState } from "react";
import { Spinner } from "./kit";

/** A dark auto-scrolling terminal/log pane (Vercel keeps logs dark in light UI). */
export function Console({
  text,
  placeholder,
  className,
  busy,
}: {
  text: string;
  placeholder?: string;
  className?: string;
  /** Show a live "working…" spinner + elapsed timer so silent steps don't look frozen. */
  busy?: boolean;
}): JSX.Element {
  const ref = useRef<HTMLPreElement>(null);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [text, busy, secs]);

  useEffect(() => {
    if (!busy) {
      setSecs(0);
      return;
    }
    const iv = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [busy]);

  return (
    <pre
      ref={ref}
      style={{ background: "#0a0a0a", color: "#e4e4e4" }}
      className={`overflow-auto rounded-lg border border-[#2a2a2a] p-3 font-mono text-[11.5px] leading-relaxed ${className ?? ""}`}
    >
      {text || (
        <span style={{ color: "#8f8f8f" }}>
          {placeholder ?? "No output yet."}
        </span>
      )}
      {busy ? (
        <span style={{ color: "#9aa0a6" }}>
          {text ? "\n" : ""}
          <Spinner /> working… {secs}s
        </span>
      ) : null}
    </pre>
  );
}
