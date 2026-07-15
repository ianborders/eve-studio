import type { ModelConfig } from "@shared/ipc";
import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Spinner,
  ViewHeader,
  cx,
} from "../ui/kit";

const MODELS = [
  "anthropic/claude-opus-4.8",
  "anthropic/claude-sonnet-5",
  "anthropic/claude-haiku-4.5",
  "openai/gpt-5.5",
  "openai/gpt-5.4-mini",
];
const REASONING = [
  "provider-default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

export function Model(): JSX.Element {
  const id = useStore((s) => s.activeAgentId);
  const reloadStructure = useStore((s) => s.loadStructure);
  const [cfg, setCfg] = useState<ModelConfig | null>(null);
  const [model, setModel] = useState("");
  const [reasoning, setReasoning] = useState("provider-default");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      return;
    }
    setLoading(true);
    try {
      const c = await window.studio.agents.modelRead(id);
      setCfg(c);
      setModel(c.model ?? "");
      setReasoning(c.reasoning ?? "provider-default");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty =
    cfg !== null &&
    (model !== (cfg.model ?? "") ||
      reasoning !== (cfg.reasoning ?? "provider-default"));

  const save = async (): Promise<void> => {
    if (!id) {
      return;
    }
    setSaving(true);
    setErr(null);
    const r = await window.studio.agents.modelWrite(id, model, reasoning);
    setSaving(false);
    if (r.ok) {
      setCfg((c) => (c ? { ...c, model, reasoning } : c));
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
      void reloadStructure(id, true);
    } else {
      setErr(r.error ?? "Failed to write agent.ts.");
    }
  };

  if (loading && !cfg) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        kicker="Instructions"
        title="Model"
        right={
          <>
            {dirty ? (
              <span className="font-spacemono text-[10px] uppercase tracking-[0.14em] text-warn">
                unsaved
              </span>
            ) : null}
            {saved ? (
              <span className="font-spacemono text-[10px] uppercase tracking-[0.14em] text-success">
                saved
              </span>
            ) : null}
            <Button
              variant="primary"
              size="sm"
              onClick={save}
              disabled={!dirty || saving || !cfg?.editable}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
          {cfg && !cfg.editable ? (
            <Card className="bg-warn/[0.06] px-3 py-2.5 text-[13px] leading-relaxed text-muted">
              {cfg.note}
            </Card>
          ) : null}

          <Field label="Model" hint="Vercel AI Gateway id — provider/model">
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={!cfg?.editable}
              placeholder="anthropic/claude-opus-4.8"
              className="font-mono"
            />
          </Field>
          <div className="-mt-2 flex flex-wrap gap-1.5">
            {MODELS.map((m) => (
              <button
                key={m}
                type="button"
                disabled={!cfg?.editable}
                onClick={() => setModel(m)}
                className={cx(
                  "rounded-md border px-2.5 py-1 font-mono text-2xs transition-colors disabled:opacity-40",
                  model === m
                    ? "border-text bg-text text-white"
                    : "border-border text-muted hover:border-border-strong hover:text-text",
                )}
              >
                {m}
              </button>
            ))}
          </div>

          <Field label="Reasoning effort" hint="provider-agnostic">
            <div className="flex flex-wrap gap-1.5">
              {REASONING.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={!cfg?.editable}
                  onClick={() => setReasoning(r)}
                  className={cx(
                    "rounded-md border px-2.5 py-1 text-2xs transition-colors disabled:opacity-40",
                    reasoning === r
                      ? "border-text bg-text text-white"
                      : "border-border text-muted hover:border-border-strong hover:text-text",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </Field>

          {err ? <div className="text-xs text-danger">{err}</div> : null}

          <div className="flex items-start gap-2 border-t border-border pt-4 text-2xs leading-relaxed text-faint">
            <Badge>gateway</Badge>
            <span>
              Routed through the Vercel AI Gateway. Any{" "}
              <span className="font-mono">provider/model</span> from the catalog
              works — type it above. Full catalog at
              vercel.com/ai-gateway/models.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
