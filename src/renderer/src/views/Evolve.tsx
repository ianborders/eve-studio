import type { EvolveSuggestion, QueuedProposal } from "@shared/ipc";
import { useEffect, useState } from "react";
import { KIND_LABEL, ProposalReview } from "../components/ProposalReview";
import { useActiveStructure } from "../lib/useStructure";
import { useEvolve } from "../lib/useEvolve";
import { IconRefresh, IconWand } from "../ui/icons";
import {
  Badge,
  Button,
  EmptyState,
  Spinner,
  Textarea,
  ViewHeader,
} from "../ui/kit";

const EXAMPLES = [
  "Create a skill for yourself that turns a rough idea into three post drafts.",
  "Every morning at 7am, pull my open issues and DM a summary to my Slack.",
  "From now on, always ask a clarifying question before drafting anything.",
];

export function Evolve(): JSX.Element {
  const { id } = useActiveStructure();
  const ev = useEvolve(id);

  const [intent, setIntent] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<EvolveSuggestion[] | null>(
    null,
  );
  const [proposeOn, setProposeOn] = useState<boolean | null>(null);
  const [proposals, setProposals] = useState<QueuedProposal[]>([]);
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);

  const loadProposals = (): void => {
    if (id) {
      void window.studio.evolve
        .listProposals(id)
        .then((r) => setProposals(r.ok ? r.proposals : []));
    }
  };

  // Turn a proposal down without applying it. Marks the brain note resolved so
  // it stops coming back — otherwise the only way out of the inbox is to
  // approve it.
  const dismissProposal = async (p: QueuedProposal): Promise<void> => {
    if (!id) {
      return;
    }
    setDismissing(p.note);
    await window.studio.evolve.resolveProposal(id, p.note);
    setProposals((list) => list.filter((x) => x.note !== p.note));
    setDismissing(null);
    if (activeNote === p.note) {
      setActiveNote(null);
      ev.reset();
    }
  };

  useEffect(() => {
    if (id) {
      setProposeOn(null);
      setProposals([]);
      setActiveNote(null);
      void window.studio.evolve.getProposeTool(id).then(setProposeOn);
      void window.studio.evolve
        .listProposals(id)
        .then((r) => setProposals(r.ok ? r.proposals : []));
    }
  }, [id]);

  // Poll the brain so proposals from Slack show up without reopening the tab.
  useEffect(() => {
    if (!id) {
      return;
    }
    const t = setInterval(() => {
      void window.studio.evolve
        .listProposals(id)
        .then((r) => setProposals(r.ok ? r.proposals : []));
    }, 20_000);
    return () => clearInterval(t);
  }, [id]);

  // When a queued proposal is approved, mark it resolved + refresh the inbox.
  useEffect(() => {
    if (ev.phase === "done" && ev.result?.ok && activeNote && id) {
      void window.studio.evolve.resolveProposal(id, activeNote).then(() => {
        setActiveNote(null);
        loadProposals();
      });
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: run on apply completion
  }, [ev.phase, ev.result]);

  const reviewProposal = (p: QueuedProposal): void => {
    setActiveNote(p.note);
    setIntent(p.intent);
    void ev.draft(p.intent);
  };

  const togglePropose = async (): Promise<void> => {
    if (!id || proposeOn === null) {
      return;
    }
    const next = !proposeOn;
    setProposeOn(next);
    const r = await window.studio.evolve.setProposeTool(id, next);
    setProposeOn(r.enabled);
  };

  const busy = ev.phase === "drafting" || ev.phase === "applying";

  const scan = async (): Promise<void> => {
    if (!id) {
      return;
    }
    setScanning(true);
    setScanError(null);
    const r = await window.studio.evolve.detect(id);
    setScanning(false);
    if (r.ok) {
      setSuggestions(r.suggestions);
    } else {
      setScanError(r.error ?? "Scan failed.");
      setSuggestions([]);
    }
  };

  const draftFrom = (s: EvolveSuggestion): void => {
    setIntent(s.intent);
    void ev.draft(s.intent);
  };

  const idle = ev.phase === "idle" || ev.phase === "drafting";

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        kicker="Evolve"
        right={
          ev.phase !== "idle" ? (
            <Button onClick={ev.reset} size="sm" variant="ghost">
              Start over
            </Button>
          ) : undefined
        }
        title="Evolve"
      />

      <div className="flex-1 overflow-auto">
        {id ? (
          <div className="mx-auto max-w-2xl space-y-4 px-4 py-5">
            {idle && proposals.length > 0 ? (
              <div className="space-y-2 rounded-xl border border-accent/30 bg-accent/[0.04] p-3">
                <div className="flex items-center gap-2">
                  <Badge tone="accent">Proposals</Badge>
                  <span className="flex-1 text-2xs text-muted">
                    the agent proposed {proposals.length} change
                    {proposals.length > 1 ? "s" : ""} (e.g. from Slack) — review
                    to apply
                  </span>
                  <button
                    className="text-faint transition-colors hover:text-foreground"
                    onClick={loadProposals}
                    title="Refresh proposals"
                    type="button"
                  >
                    <IconRefresh className="h-3.5 w-3.5" />
                  </button>
                </div>
                {proposals.map((p) => (
                  <div
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2.5"
                    key={p.note}
                  >
                    <Badge>{KIND_LABEL[p.kind]}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-[13px] text-foreground">
                        {p.title}
                      </div>
                      <div className="truncate text-2xs text-muted">
                        {p.intent}
                      </div>
                    </div>
                    <Button
                      disabled={ev.phase === "drafting"}
                      onClick={() => reviewProposal(p)}
                      size="sm"
                      variant="primary"
                    >
                      Review
                    </Button>
                    <Button
                      disabled={dismissing === p.note}
                      onClick={() => void dismissProposal(p)}
                      size="sm"
                      title="Turn this down — the agent won't ask again"
                      variant="ghost"
                    >
                      {dismissing === p.note ? <Spinner /> : "Dismiss"}
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}

            <p className="text-[13px] leading-relaxed text-muted">
              Tell the agent what to change about itself — a new skill, a
              scheduled job, or how it behaves. Studio drafts the change with
              the agent's own model, you review the exact diff, and it's applied
              and committed. Nothing changes until you approve.
            </p>

            <Textarea
              disabled={busy}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="e.g. Create a skill that drafts a weekly investor update from my notes."
              rows={3}
              value={intent}
            />

            {idle ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLES.map((ex) => (
                    <button
                      className="rounded-full border border-border bg-canvas px-2.5 py-1 text-2xs text-muted transition-colors hover:border-border-strong hover:text-foreground"
                      key={ex}
                      onClick={() => setIntent(ex)}
                      type="button"
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
                    disabled={ev.phase === "drafting" || !intent.trim()}
                    onClick={() => ev.draft(intent)}
                    variant="primary"
                  >
                    {ev.phase === "drafting" ? (
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

                <div className="border-border border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-[13px] text-foreground">
                        Learn from what you do
                      </div>
                      <div className="text-2xs text-muted">
                        Scan recent chats and memory for repeated tasks worth
                        automating.
                      </div>
                    </div>
                    <Button
                      disabled={scanning}
                      onClick={scan}
                      size="sm"
                      variant="ghost"
                    >
                      {scanning ? (
                        <>
                          <Spinner />
                          Scanning…
                        </>
                      ) : (
                        <>
                          <IconRefresh className="h-3.5 w-3.5" />
                          Scan for patterns
                        </>
                      )}
                    </Button>
                  </div>

                  {scanError ? (
                    <div className="mt-2 text-2xs text-muted">{scanError}</div>
                  ) : null}

                  {suggestions && suggestions.length === 0 && !scanError ? (
                    <div className="mt-2 text-2xs text-muted">
                      No clear repeated patterns yet — keep using the agent and
                      scan again later.
                    </div>
                  ) : null}

                  {suggestions && suggestions.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {suggestions.map((s) => (
                        <div
                          className="rounded-lg border border-border bg-canvas p-3"
                          key={s.intent}
                        >
                          <div className="flex items-center gap-2">
                            <Badge>{KIND_LABEL[s.kind]}</Badge>
                            <span className="font-medium text-[13px] text-foreground">
                              {s.title}
                            </span>
                          </div>
                          <p className="mt-1 text-2xs leading-relaxed text-muted">
                            {s.rationale}
                          </p>
                          <div className="mt-2 flex justify-end">
                            <Button
                              disabled={ev.phase === "drafting"}
                              onClick={() => draftFrom(s)}
                              size="sm"
                              variant="secondary"
                            >
                              <IconWand className="h-3.5 w-3.5" />
                              Draft this
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between border-border border-t pt-4">
                  <div className="pr-4">
                    <div className="font-medium text-[13px] text-foreground">
                      Let the agent propose its own changes
                    </div>
                    <div className="text-2xs text-muted">
                      Adds a tool so the agent can offer changes mid-chat — you
                      still approve every diff. Restart the agent after
                      enabling. To propose from Slack, the agent has to be
                      deployed: it queues to its own storage, and Studio picks
                      it up here.
                    </div>
                  </div>
                  <button
                    aria-pressed={proposeOn === true}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                      proposeOn ? "bg-text" : "bg-black/[0.12]"
                    } ${proposeOn === null ? "opacity-40" : ""}`}
                    disabled={proposeOn === null}
                    onClick={togglePropose}
                    type="button"
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                        proposeOn ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </>
            ) : null}

            {ev.error ? (
              <div className="text-xs text-danger">{ev.error}</div>
            ) : null}

            <ProposalReview ev={ev} onDone={() => setIntent("")} />
          </div>
        ) : (
          <EmptyState
            icon={<IconWand className="h-6 w-6" />}
            kicker="Evolve"
            title="No agent selected"
          >
            Pick an agent to teach it new skills, schedules, and behavior.
          </EmptyState>
        )}
      </div>
    </div>
  );
}
