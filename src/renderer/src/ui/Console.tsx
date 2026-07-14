import { useEffect, useRef } from "react";

/** A dark auto-scrolling terminal-style output pane. */
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
      className={`overflow-auto rounded-lg border border-border bg-black/50 p-3 font-mono text-[11.5px] leading-relaxed text-neutral-300 ${className ?? ""}`}
    >
      {text || <span className="text-faint">{placeholder ?? "No output yet."}</span>}
    </pre>
  );
}
