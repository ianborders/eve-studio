import type { EvolveApplyResult, EvolveProposal } from "@shared/ipc";
import { useState } from "react";
import { useStore } from "../store";

export type EvolvePhase = "idle" | "drafting" | "review" | "applying" | "done";

export interface UseEvolve {
  phase: EvolvePhase;
  proposal: EvolveProposal | null;
  result: EvolveApplyResult | null;
  error: string | null;
  restarting: boolean;
  running: boolean;
  /** Draft a proposal from an intent, moving to the review phase. */
  draft: (intent: string) => Promise<void>;
  /** Apply the current proposal (write files / remember). */
  apply: () => Promise<void>;
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
  const startAgent = useStore((s) => s.startAgent);
  const stopAgent = useStore((s) => s.stopAgent);
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
    const r = await window.studio.evolve.draft(agentId, text);
    if (r.ok && r.proposal) {
      setProposal(r.proposal);
      setPhase("review");
    } else {
      setError(r.error ?? "Couldn't draft a change.");
      setPhase("idle");
    }
  };

  const apply = async (): Promise<void> => {
    if (!(agentId && proposal)) {
      return;
    }
    setPhase("applying");
    const r = await window.studio.evolve.apply(agentId, proposal);
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
    await stopAgent(agentId);
    await startAgent(agentId);
    setRestarting(false);
  };

  return {
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
