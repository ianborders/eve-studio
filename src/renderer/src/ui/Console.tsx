import { useEffect, useRef } from "react";

/** A dark auto-scrolling terminal/log pane (Vercel keeps logs dark in light UI). */
export function Console({
  text,
  placeholder,
  className,
}: {
  text: string;
  placeholder?: string;
  className?: string;
}): JSX.Element {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [text]);

  return (
    <pre
      ref={ref}
      style={{ background: "#0a0a0a", color: "#e4e4e4" }}
      className={`overflow-auto rounded-lg border border-[#2a2a2a] p-3 font-mono text-[11.5px] leading-relaxed ${className ?? ""}`}
    >
      {text || (
        <span style={{ color: "#8f8f8f" }}>{placeholder ?? "No output yet."}</span>
      )}
    </pre>
  );
}
