import { useEffect, useRef, useState } from "react";

/** Manage a single streaming eve CLI run (build / deploy / eval / init). */
export function useCliRun(): {
  output: string;
  running: boolean;
  exitCode: number | null | undefined;
  start: (launch: () => Promise<string>) => Promise<void>;
  cancel: () => void;
  reset: () => void;
} {
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [exitCode, setExitCode] = useState<number | null | undefined>(undefined);
  const runIdRef = useRef<string | null>(null);

  useEffect(() => {
    const offChunk = window.studio.cli.onChunk(({ runId, data }) => {
      if (runId === runIdRef.current) {
        setOutput((o) => o + data);
      }
    });
    const offExit = window.studio.cli.onExit(({ runId, code }) => {
      if (runId === runIdRef.current) {
        setRunning(false);
        setExitCode(code);
      }
    });
    return () => {
      offChunk();
      offExit();
    };
  }, []);

  return {
    output,
    running,
    exitCode,
    start: async (launch) => {
      setOutput("");
      setExitCode(undefined);
      setRunning(true);
      const id = await launch();
      runIdRef.current = id;
    },
    cancel: () => {
      if (runIdRef.current) {
        void window.studio.cli.cancel(runIdRef.current);
      }
    },
    reset: () => {
      runIdRef.current = null;
      setOutput("");
      setExitCode(undefined);
      setRunning(false);
    },
  };
}
