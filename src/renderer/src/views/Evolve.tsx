import type { EvolveSuggestion } from "@shared/ipc";
import { useState } from "react";
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
