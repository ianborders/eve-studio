import type { ModelConfig } from "@shared/ipc";
import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store";
import { IconBolt } from "../ui/icons";
import { Badge, Button, Card, Field, Input, Spinner } from "../ui/kit";

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
    (model !== (cfg.model ?? "") || reasoning !== (cfg.reasoning ?? "provider-default"));

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
      <div className="flex items-center gap-2 border-b border-border px-5 py-2.5">
        <IconBolt className="h-4 w-4 text-muted" />
        <div className="text-[13px] font-medium text-text">Model &amp; reasoning</div>
        <div className="flex-1" />
        {dirty ? <span className="text-2xs text-warn">unsaved</span> : null}
        {saved ? <span className="text-2xs text-success">saved ✓</span> : null}
        <Button
          variant="primary"
          size="sm"
          onClick={save}
          disabled={!dirty || saving || !cfg?.editable}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-2xl space-y-4">
          {cfg && !cfg.editable ? (
            <Card className="bg-warn/[0.06] p-3 text-[13px] text-muted">
              {cfg.note}
            </Card>
          ) : null}

          <Card className="space-y-4 p-4">
            <Field label="Model" hint="Vercel AI Gateway id — provider/model">
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={!cfg?.editable}
                placeholder="anthropic/claude-opus-4.8"
                className="font-mono"
              />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {MODELS.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={!cfg?.editable}
                  onClick={() => setModel(m)}
                  className={`rounded-lg border px-2.5 py-1 font-mono text-2xs transition-colors ${
                    model === m
                      ? "border-text bg-text text-white"
                      : "border-border text-muted hover:bg-hover"
                  }`}
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
                    className={`rounded-lg border px-2.5 py-1 text-2xs transition-colors ${
                      reasoning === r
                        ? "border-text bg-text text-white"
                        : "border-border text-muted hover:bg-hover"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </Field>

            {err ? <div className="text-xs text-danger">{err}</div> : null}
          </Card>

          <div className="flex items-center gap-2 text-2xs text-faint">
            <Badge>gateway</Badge>
            Routed through the Vercel AI Gateway. Any{" "}
            <span className="font-mono">provider/model</span> from the catalog works —
            type it above. Full catalog at vercel.com/ai-gateway/models.
          </div>
        </div>
      </div>
    </div>
  );
}
