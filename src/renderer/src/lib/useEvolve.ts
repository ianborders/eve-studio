import type { EvolveApplyResult, EvolveProposal } from "@shared/ipc";
import { useState } from "react";
import { useStore } from "../store";

export type EvolvePhase = "idle" | "drafting" | "review" | "applying" | "done";

export interface UseEvolve {
  agentId: string | null;
  phase: EvolvePhase;
  proposal: EvolveProposal | null;
  result: EvolveApplyResult | null;
  error: string | null;
  restarting: boolean;
  running: boolean;
  /** Draft a proposal from an intent, moving to the review phase. */
  draft: (intent: string) => Promise<void>;
  /** Apply the current proposal, or an edited copy from the review UI. */
  apply: (edited?: EvolveProposal) => Promise<void>;
  /** Stop + start the agent to load the change locally. */
  restart: () => Promise<void>;
  /** Return to idle, clearing the current proposal/result. */
  reset: () => void;
}

/**
 * The Evolve state machine, shared by the Evolve tab and the in-chat modal so
 * both drive the same draft → review → apply → restart flow.
 */
export function useEvolve(agentId: string | null): UseEvolve {
  const loadStructure = useStore((s) => s.loadStructure);
  const running = useStore((s) =>
    agentId ? s.runtime[agentId]?.status === "running" : false,
  );

  const [phase, setPhase] = useState<EvolvePhase>("idle");
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

  const draft = async (intent: string): Promise<void> => {
    const text = intent.trim();
    if (!(agentId && text)) {
      return;
    }
    setPhase("drafting");
    setError(null);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const r = await window.studio.evolve.draft(agentId, text, timezone);
    if (r.ok && r.proposal) {
      setProposal(r.proposal);
      setPhase("review");
    } else {
      setError(r.error ?? "Couldn't draft a change.");
      setPhase("idle");
    }
  };

  /** Apply the proposal — or an edited copy from the review UI. */
  const apply = async (edited?: EvolveProposal): Promise<void> => {
    const toApply = edited ?? proposal;
    if (!(agentId && toApply)) {
      return;
    }
    if (edited) {
      setProposal(edited);
    }
    setPhase("applying");
    const r = await window.studio.evolve.apply(agentId, toApply);
    setResult(r);
    setPhase("done");
    if (r.ok) {
      void loadStructure(agentId, true);
    } else {
      setError(r.error ?? "Apply failed.");
    }
  };

  const restart = async (): Promise<void> => {
    if (!agentId) {
      return;
    }
    setRestarting(true);
    // Atomic restart in the main process (stop → wait for exit → start); the
    // store's status subscription reflects the new state.
    await window.studio.agents.restart(agentId);
    // eve dev recompiles the manifest on restart — reload so newly authored
    // schedules/tools/skills show up instead of a stale count.
    void loadStructure(agentId, true);
    setRestarting(false);
  };

  return {
    agentId,
    phase,
    proposal,
    result,
    error,
    restarting,
    running,
    draft,
    apply,
    restart,
    reset,
  };
}
