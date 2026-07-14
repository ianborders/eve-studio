import type { AgentRunStatus } from "@shared/ipc";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// --- Button ---
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BTN_BASE =
  "no-drag inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 select-none";
const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-black hover:bg-accent/90",
  secondary:
    "bg-white/[0.06] text-text hover:bg-white/[0.1] border border-border",
  ghost: "text-muted hover:bg-white/[0.06] hover:text-text",
  danger: "bg-danger/15 text-danger hover:bg-danger/25",
};
const BTN_SIZE: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-8 px-3 text-[13px]",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}): JSX.Element {
  return (
    <button
      type="button"
      className={cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element {
  return (
    <button
      type="button"
      className={cx(
        "no-drag inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.08] hover:text-text disabled:opacity-40",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// --- Badge ---
type Tone = "default" | "accent" | "warn" | "danger" | "info" | "violet";
const TONE: Record<Tone, string> = {
  default: "bg-white/[0.06] text-muted",
  accent: "bg-accent/15 text-accent",
  warn: "bg-warn/15 text-warn",
  danger: "bg-danger/15 text-danger",
  info: "bg-info/15 text-info",
  violet: "bg-violet/15 text-violet",
};

export function Badge({
  tone = "default",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium",
        TONE[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

// --- StatusDot ---
const DOT: Record<AgentRunStatus, string> = {
  running: "bg-accent",
  starting: "bg-warn",
  stopped: "bg-faint",
  error: "bg-danger",
};

export function StatusDot({
  status,
  className,
}: {
  status: AgentRunStatus;
  className?: string;
}): JSX.Element {
  return (
    <span className={cx("relative inline-flex", className)}>
      <span className={cx("h-2 w-2 rounded-full", DOT[status])} />
      {status === "running" ? (
        <span className="absolute inset-0 h-2 w-2 animate-pulse-ring rounded-full" />
      ) : null}
      {status === "starting" ? (
        <span className="absolute inset-0 h-2 w-2 animate-ping rounded-full bg-warn/60" />
      ) : null}
    </span>
  );
}

// --- Card ---
export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      className={cx(
        "rounded-xl border border-border bg-panel shadow-card",
        className
      )}
    >
      {children}
    </div>
  );
}

// --- Inputs ---
export function Input(
  props: InputHTMLAttributes<HTMLInputElement>
): JSX.Element {
  return (
    <input
      {...props}
      className={cx(
        "no-drag w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[13px] text-text outline-none transition-colors placeholder:text-faint focus:border-accent/60",
        props.className
      )}
    />
  );
}

export function Textarea(
  props: TextareaHTMLAttributes<HTMLTextAreaElement>
): JSX.Element {
  return (
    <textarea
      {...props}
      className={cx(
        "no-drag w-full rounded-lg border border-border bg-bg px-3 py-2 text-[13px] leading-relaxed text-text outline-none transition-colors placeholder:text-faint focus:border-accent/60",
        props.className
      )}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        {hint ? <span className="text-2xs text-faint">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

// --- Spinner ---
export function Spinner({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx("h-4 w-4 animate-spin", className)}
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// --- EmptyState ---
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      {icon ? (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-panel text-muted">
          {icon}
        </div>
      ) : null}
      <div className="text-[15px] font-medium text-text">{title}</div>
      {children ? (
        <div className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">
          {children}
        </div>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

// --- Tabs (horizontal, underline) ---
export interface TabItem {
  id: string;
  label: string;
  icon?: (p: { className?: string }) => JSX.Element;
  count?: number;
}

export function Tabs({
  items,
  active,
  onChange,
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
}): JSX.Element {
  return (
    <div className="no-drag flex items-center gap-0.5 overflow-x-auto">
      {items.map((t) => {
        const on = t.id === active;
        const Ico = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cx(
              "relative flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
              on ? "text-text" : "text-muted hover:bg-white/[0.05] hover:text-text"
            )}
          >
            {Ico ? <Ico className="h-3.5 w-3.5" /> : null}
            {t.label}
            {typeof t.count === "number" ? (
              <span className="rounded bg-white/[0.08] px-1 text-2xs text-muted">
                {t.count}
              </span>
            ) : null}
            {on ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// --- SectionHeader (for panels) ---
export function PanelHeader({
  title,
  count,
  right,
}: {
  title: string;
  count?: number;
  right?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium text-text">{title}</span>
        {typeof count === "number" ? (
          <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-2xs text-muted">
            {count}
          </span>
        ) : null}
      </div>
      {right}
    </div>
  );
}
