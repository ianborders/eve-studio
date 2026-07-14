import type { InstructionsFile } from "@shared/ipc";
import { useCallback, useEffect, useState } from "react";
import { useActiveStructure } from "../lib/useStructure";
import { IconBolt, IconFile } from "../ui/icons";
import { Badge, Button, Spinner, Textarea } from "../ui/kit";

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
      <div className="flex items-center gap-3 border-b border-border px-5 py-2.5">
        <IconFile className="h-4 w-4 text-muted" />
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-text">System prompt</div>
          <div className="truncate font-mono text-2xs text-faint">
            {file?.relPath ?? "instructions.md"}
          </div>
        </div>
        {structure?.model ? (
          <Badge tone="violet">
            <IconBolt className="h-3 w-3" />
            {structure.model}
          </Badge>
        ) : null}
        <div className="flex-1" />
        {dirty ? <span className="text-2xs text-warn">unsaved</span> : null}
        {saved ? <span className="text-2xs text-accent">saved ✓</span> : null}
        <Button variant="ghost" size="sm" onClick={load} disabled={saving}>
          Revert
        </Button>
        <Button variant="primary" size="sm" onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="min-h-0 flex-1 p-4">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          placeholder="# You are…"
          className="h-full resize-none font-mono text-[13px] leading-relaxed"
        />
      </div>
    </div>
  );
}
