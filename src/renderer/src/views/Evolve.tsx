import type {
  EvolveApplyResult,
  EvolveProposal,
  ProposalFileChange,
  ProposalKind,
} from "@shared/ipc";
import { useState } from "react";
import { useActiveStructure } from "../lib/useStructure";
import { useStore } from "../store";
import { IconRocket, IconWand } from "../ui/icons";
import {
  Badge,
  Button,
  EmptyState,
  Spinner,
  Textarea,
  ViewHeader,
} from "../ui/kit";

type Phase = "idle" | "drafting" | "review" | "applying" | "done";

const EXAMPLES = [
  "Create a skill for yourself that turns a rough idea into three post drafts.",
  "Every morning at 7am, pull my open issues and DM a summary to my Slack.",
  "From now on, always ask a clarifying question before drafting anything.",
];

const KIND_LABEL: Record<ProposalKind, string> = {
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

export function Evolve(): JSX.Element {
  const { id, reload } = useActiveStructure();
  const startAgent = useStore((s) => s.startAgent);
  const stopAgent = useStore((s) => s.stopAgent);
  const running = useStore((s) =>
    id ? s.runtime[id]?.status === "running" : false,
  );

  const [intent, setIntent] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [proposal, setProposal] = useState<EvolveProposal | null>(null);
  const [result, setResult] = useState<EvolveApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  const reset = (): void => {
    setPhase("idle");
    setProposal(null);
    setResult(null);
    setError(null);
  };

  const draft = async (): Promise<void> => {
    if (!(id && intent.trim())) {
      return;
    }
    setPhase("drafting");
    setError(null);
    const r = await window.studio.evolve.draft(id, intent);
    if (r.ok && r.proposal) {
      setProposal(r.proposal);
      setPhase("review");
    } else {
      setError(r.error ?? "Couldn't draft a change.");
      setPhase("idle");
    }
  };

  const apply = async (): Promise<void> => {
    if (!(id && proposal)) {
      return;
    }
    setPhase("applying");
    const r = await window.studio.evolve.apply(id, proposal);
    setResult(r);
    setPhase("done");
    if (r.ok) {
      reload();
    } else {
      setError(r.error ?? "Apply failed.");
    }
  };

  const restart = async (): Promise<void> => {
    if (!id) {
      return;
    }
    setRestarting(true);
    await stopAgent(id);
    await startAgent(id);
    setRestarting(false);
  };

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        kicker="Evolve"
        title="Evolve"
        right={
          phase !== "idle" ? (
            <Button size="sm" variant="ghost" onClick={reset}>
              Start over
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-auto">
        {!id ? (
          <EmptyState
            icon={<IconWand className="h-6 w-6" />}
            kicker="Evolve"
            title="No agent selected"
          >
            Pick an agent to teach it new skills, schedules, and behavior.
          </EmptyState>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4 px-4 py-5">
            <p className="text-[13px] leading-relaxed text-muted">
              Tell the agent what to change about itself — a new skill, a
              scheduled job, or how it behaves. Studio drafts the change with
              the agent's own model, you review the exact diff, and it's applied
              and committed. Nothing changes until you approve.
            </p>

            <Textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              rows={3}
              placeholder="e.g. Create a skill that drafts a weekly investor update from my notes."
              disabled={phase === "drafting" || phase === "applying"}
            />

            {phase === "idle" || phase === "drafting" ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setIntent(ex)}
                      className="rounded-full border border-border bg-canvas px-2.5 py-1 text-2xs text-muted transition-colors hover:border-border-strong hover:text-foreground"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-2xs text-faint">
                    Uses the agent's linked AI Gateway to author the change.
                  </span>
                  <Button
                    variant="primary"
                    onClick={draft}
                    disabled={phase === "drafting" || !intent.trim()}
                  >
                    {phase === "drafting" ? (
                      <>
                        <Spinner />
                        Drafting…
                      </>
                    ) : (
                      <>
                        <IconWand className="h-3.5 w-3.5" />
                        Draft change
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : null}

            {error ? <div className="text-xs text-danger">{error}</div> : null}

            {phase === "review" && proposal ? (
              <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center gap-2">
                  <Badge>{KIND_LABEL[proposal.kind]}</Badge>
                  <span className="font-medium text-[14px] text-foreground">
                    {proposal.title}
                  </span>
                </div>
                {proposal.rationale ? (
                  <p className="text-[13px] leading-relaxed text-muted">
                    {proposal.rationale}
                  </p>
                ) : null}

                {proposal.prereqs.length > 0 ? (
                  <div className="rounded-lg bg-warn/10 px-3 py-2 text-2xs text-warn">
                    <div className="mb-1 font-medium">Needs setup first:</div>
                    <ul className="list-disc space-y-0.5 pl-4">
                      {proposal.prereqs.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {proposal.kind === "memory" ? (
                  <div className="rounded-lg bg-canvas px-3 py-2 text-[13px] text-muted">
                    <span className="text-faint">Fact to remember: </span>
                    {proposal.memory}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {proposal.files.map((f) => (
                      <FileDiff key={f.relPath} file={f} />
                    ))}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="ghost" onClick={reset}>
                    Discard
                  </Button>
                  <Button variant="primary" onClick={apply}>
                    Approve &amp; apply
                  </Button>
                </div>
              </div>
            ) : null}

            {phase === "applying" ? (
              <div className="flex items-center gap-2 text-[13px] text-muted">
                <Spinner />
                Applying…
              </div>
            ) : null}

            {phase === "done" && result ? (
              <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
                {result.ok ? (
                  <>
                    {result.note ? (
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
                            <li
                              key={w}
                              className="font-mono text-2xs text-muted"
                            >
                              {w}
                            </li>
                          ))}
                        </ul>
                        {result.needsRebuild ? (
                          <div className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2">
                            <span className="text-2xs text-muted">
                              Restart the agent to load the change locally, then
                              deploy from the Deploy tab to push it to
                              production.
                            </span>
                            {running ? (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={restart}
                                disabled={restarting}
                              >
                                {restarting ? (
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
                    )}
                  </>
                ) : (
                  <div className="text-xs text-danger">
                    {result.error ?? "Apply failed."}
                  </div>
                )}
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setIntent("");
                      reset();
                    }}
                  >
                    Make another change
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
