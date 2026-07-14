import type { AgentStructure } from "@shared/ipc";
import { useEffect } from "react";
import { useStore } from "../store";

/** Load + return the compiled structure for the active agent. */
export function useActiveStructure(): {
  id: string | null;
  structure: AgentStructure | undefined;
  loading: boolean;
  reload: () => void;
} {
  const id = useStore((s) => s.activeAgentId);
  const structure = useStore((s) => (id ? s.structure[id] : undefined));
  const loading = useStore((s) => (id ? Boolean(s.structureLoading[id]) : false));
  const load = useStore((s) => s.loadStructure);

  useEffect(() => {
    if (id) {
      void load(id);
    }
  }, [id, load]);

  return {
    id,
    structure,
    loading,
    reload: () => {
      if (id) {
        void load(id, true);
      }
    },
  };
}
