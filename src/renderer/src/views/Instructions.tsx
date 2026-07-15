import type { InstructionsFile } from "@shared/ipc";
import { useCallback, useEffect, useState } from "react";
import { useActiveStructure } from "../lib/useStructure";
import { IconBolt } from "../ui/icons";
import { Badge, Button, Spinner, ViewHeader } from "../ui/kit";

export function Instructions(): JSX.Element {
  const { id, structure } = useActiveStructure();
  const [file, setFile] = useState<InstructionsFile | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      return;
    }
    setLoading(true);
    try {
      const f = await window.studio.agents.readInstructions(id);
      setFile(f);
      setDraft(f.content);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = file !== null && draft !== file.content;

  const save = async (): Promise<void> => {
    if (!id || !dirty) {
      return;
    }
    setSaving(true);
    try {
      await window.studio.agents.writeInstructions(id, draft);
      setFile((f) => (f ? { ...f, content: draft, exists: true } : f));
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !file) {
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
        title="Prompt"
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
            <Button variant="ghost" size="sm" onClick={load} disabled={saving}>
              Revert
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={save}
              disabled={!dirty || saving}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          placeholder="# You are…"
          className="no-drag h-full w-full resize-none border-0 bg-transparent px-6 py-5 font-mono text-[13px] leading-relaxed text-text outline-none placeholder:text-faint"
        />
      </div>

      <div className="flex items-center gap-2 border-t border-border px-6 py-2.5">
        <span className="font-mono text-2xs text-faint">
          {file?.relPath ?? "instructions.md"}
        </span>
        <div className="flex-1" />
        {structure?.model ? (
          <Badge tone="violet">
            <IconBolt className="h-3 w-3" />
            {structure.model}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
