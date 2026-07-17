import type { ProposalFileChange, ProposalKind } from "@shared/ipc";
import { useEffect, useState } from "react";
import type { UseEvolve } from "../lib/useEvolve";
import { IconRocket } from "../ui/icons";
import { Badge, Button, Input, Spinner, Textarea } from "../ui/kit";

/**
 * A prereq line. When it's a "Set VAR to …" env-var prereq, render an inline
 * field that saves the value to Vercel (production) — so the user can resolve
 * it right here instead of hunting for a buried env editor.
 */
function Prereq({
  text,
  agentId,
}: {
  text: string;
  agentId: string | null;
}): JSX.Element {
  const varName = /Set\s+([A-Z][A-Z0-9_]{2,})\s+to/.exec(text)?.[1];
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!(varName && agentId)) {
    return <li>{text}</li>;
  }

  const save = async (): Promise<void> => {
    setSaving(true);
    setErr(null);
    const r = await window.studio.vercel.envSetAll(
      agentId,
      varName,
      value.trim(),
    );
    setSaving(false);
    if (r.ok) {
      setSaved(true);
    } else {
      setErr(r.output || "Couldn't save.");
    }
  };

  return (
    <li>
      {text}
      {saved ? (
        <span className="ml-1 font-medium text-success">saved ✓</span>
      ) : (
        <div className="mt-1.5 flex items-center gap-1.5">
          <Input
            className="h-7 flex-1 font-mono text-2xs"
            onChange={(e) => setValue(e.target.value)}
            placeholder="U012ABC or C012ABC"
            value={value}
          />
          <Button
            disabled={saving || !value.trim()}
            onClick={save}
            size="sm"
            variant="primary"
          >
            {saving ? "Saving…" : "Set"}
          </Button>
        </div>
      )}
      {err ? <div className="mt-1 text-danger">{err}</div> : null}
    </li>
  );
}

export const KIND_LABEL: Record<ProposalKind, string> = {
  memory: "Memory",
  instructions: "Instructions",
  skill: "Skill",
  tool: "Tool",
  schedule: "Schedule",
};

/** Minimal LCS line diff → tagged lines for review display. */
function lineDiff(
  before: string,
  after: string,
): { tag: " " | "-" | "+"; text: string }[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: { tag: " " | "-" | "+"; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ tag: " ", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ tag: "-", text: a[i] });
      i++;
    } else {
      out.push({ tag: "+", text: b[j] });
      j++;
    }
  }
  while (i < n) {
    out.push({ tag: "-", text: a[i] });
    i++;
  }
  while (j < m) {
    out.push({ tag: "+", text: b[j] });
    j++;
  }
  return out;
}

function FileDiff({ file }: { file: ProposalFileChange }): JSX.Element {
  const isNew = file.before === null;
  const rows = isNew
    ? file.after.split("\n").map((text) => ({ tag: "+" as const, text }))
    : lineDiff(file.before ?? "", file.after);
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between border-border border-b bg-canvas px-3 py-1.5">
        <span className="font-mono text-2xs text-muted">{file.relPath}</span>
        <Badge>{isNew ? "new file" : "edit"}</Badge>
      </div>
      <pre className="max-h-80 overflow-auto bg-surface px-0 py-1 text-2xs leading-relaxed">
        {rows.map((r, idx) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: diff rows are positional
            key={idx}
            className={
              r.tag === "+"
                ? "bg-success/10 text-success"
                : r.tag === "-"
                  ? "bg-danger/10 text-danger line-through decoration-danger/40"
                  : "text-muted"
            }
          >
            <span className="inline-block w-4 select-none text-center text-faint">
              {r.tag}
            </span>
            <span className="whitespace-pre-wrap font-mono">
              {r.text || " "}
            </span>
          </div>
        ))}
      </pre>
    </div>
  );
}

/**
 * Renders the review / applying / done phases of an Evolve flow. Driven by a
 * shared `useEvolve` instance so the Evolve tab and the in-chat modal are
 * identical below the intent box.
 */
export function ProposalReview({
  ev,
  onDone,
  doneLabel = "Make another change",
}: {
  ev: UseEvolve;
  /** Called when the user dismisses the done state (clear intent / close modal). */
  onDone?: () => void;
  doneLabel?: string;
}): JSX.Element | null {
  const { phase, proposal, result } = ev;
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [memoryEdit, setMemoryEdit] = useState("");

  // Reset edit state whenever a new proposal arrives.
  const proposalKey = proposal ? `${proposal.kind}:${proposal.title}` : null;
  useEffect(() => {
    setEditing(false);
    setEdits({});
    setMemoryEdit(proposal?.memory ?? "");
  }, [proposalKey, proposal?.memory]);

  if (phase === "review" && proposal) {
    const applyEdited = (): void => {
      const edited = {
        ...proposal,
        memory: proposal.kind === "memory" ? memoryEdit : proposal.memory,
        files: proposal.files.map((f) => ({
          ...f,
          after: edits[f.relPath] ?? f.after,
        })),
      };
      void ev.apply(editing ? edited : proposal);
    };
    return (
      <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2">
          <Badge>{KIND_LABEL[proposal.kind]}</Badge>
          <span className="flex-1 font-medium text-[14px] text-foreground">
            {proposal.title}
          </span>
          <Button
            onClick={() => setEditing((e) => !e)}
            size="sm"
            variant="ghost"
          >
            {editing ? "Preview" : "Edit"}
          </Button>
        </div>
        {proposal.rationale ? (
          <p className="text-[13px] leading-relaxed text-muted">
            {proposal.rationale}
          </p>
        ) : null}

        {proposal.prereqs.length > 0 ? (
          <div className="rounded-lg bg-warn/10 px-3 py-2 text-2xs text-warn">
            <div className="mb-1 font-medium">Needs setup first:</div>
            <ul className="list-disc space-y-1.5 pl-4">
              {proposal.prereqs.map((p) => (
                <Prereq agentId={ev.agentId} key={p} text={p} />
              ))}
            </ul>
          </div>
        ) : null}

        {proposal.kind === "memory" ? (
          editing ? (
            <Textarea
              className="w-full"
              onChange={(e) => setMemoryEdit(e.target.value)}
              rows={2}
              value={memoryEdit}
            />
          ) : (
            <div className="rounded-lg bg-canvas px-3 py-2 text-[13px] text-muted">
              <span className="text-faint">Fact to remember: </span>
              {proposal.memory}
            </div>
          )
        ) : (
          <div className="space-y-2">
            {proposal.files.map((f) =>
              editing ? (
                <div
                  className="overflow-hidden rounded-lg border border-border"
                  key={f.relPath}
                >
                  <div className="border-border border-b bg-canvas px-3 py-1.5 font-mono text-2xs text-muted">
                    {f.relPath}
                  </div>
                  <textarea
                    className="no-drag block w-full resize-y bg-surface px-3 py-2 font-mono text-2xs text-text outline-none"
                    onChange={(e) =>
                      setEdits((prev) => ({
                        ...prev,
                        [f.relPath]: e.target.value,
                      }))
                    }
                    rows={Math.min(
                      18,
                      (edits[f.relPath] ?? f.after).split("\n").length + 1,
                    )}
                    spellCheck={false}
                    value={edits[f.relPath] ?? f.after}
                  />
                </div>
              ) : (
                <FileDiff file={f} key={f.relPath} />
              ),
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={ev.reset} variant="ghost">
            Discard
          </Button>
          <Button onClick={applyEdited} variant="primary">
            Approve &amp; apply
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "applying") {
    return (
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <Spinner />
        Applying…
      </div>
    );
  }

  if (phase === "done" && result) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
        {result.ok ? (
          result.note ? (
            <p className="text-[13px] leading-relaxed text-muted">
              {result.note}
            </p>
          ) : (
            <>
              <div className="rounded-lg bg-success/10 px-3 py-2 text-[13px] text-success">
                Applied{" "}
                {result.committed
                  ? "and committed"
                  : "(no git repo — not committed)"}
                .
              </div>
              <ul className="space-y-0.5">
                {result.written.map((w) => (
                  <li className="font-mono text-2xs text-muted" key={w}>
                    {w}
                  </li>
                ))}
              </ul>
              {result.needsRebuild ? (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2">
                  <span className="text-2xs text-muted">
                    Restart the agent to load the change locally, then deploy
                    from the Deploy tab to push it to production.
                  </span>
                  {ev.running ? (
                    <Button
                      disabled={ev.restarting}
                      onClick={ev.restart}
                      size="sm"
                      variant="primary"
                    >
                      {ev.restarting ? (
                        <>
                          <Spinner />
                          Restarting…
                        </>
                      ) : (
                        <>
                          <IconRocket className="h-3.5 w-3.5" />
                          Restart agent
                        </>
                      )}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          )
        ) : (
          <div className="text-xs text-danger">
            {result.error ?? "Apply failed."}
          </div>
        )}
        <div className="flex justify-end">
          <Button
            onClick={() => {
              ev.reset();
              onDone?.();
            }}
            variant="ghost"
          >
            {doneLabel}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
