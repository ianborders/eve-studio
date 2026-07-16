import { useEffect, useRef, useState } from "react";
import { useCliRun } from "../lib/useCli";
import { useStore } from "../store";
import { Console } from "../ui/Console";
import { IconFolder } from "../ui/icons";
import { Button, Field, Input, Kicker, Modal } from "../ui/kit";

const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;

export function CreateAgent({ onClose }: { onClose: () => void }): JSX.Element {
  const refreshAgents = useStore((s) => s.refreshAgents);
  const setActiveAgent = useStore((s) => s.setActiveAgent);

  const [parentDir, setParentDir] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [webChat, setWebChat] = useState(false);
  const [phase, setPhase] = useState<"form" | "running" | "done" | "error">(
    "form",
  );
  const [error, setError] = useState<string | null>(null);
  const { output, exitCode, start } = useCliRun();
  const finalized = useRef(false);

  const validName = NAME_RE.test(name);

  const pickDir = async (): Promise<void> => {
    const dir = await window.studio.dialog.pickDir();
    if (dir) {
      setParentDir(dir);
    }
  };

  const create = async (): Promise<void> => {
    if (!parentDir || !validName) {
      return;
    }
    setPhase("running");
    finalized.current = false;
    await start(() =>
      window.studio.agents.create({ parentDir, name, webChat }),
    );
  };

  // eve init can exit non-zero even on success — register by path, then trust it.
  useEffect(() => {
    if (phase !== "running" || exitCode === undefined || finalized.current) {
      return;
    }
    finalized.current = true;
    void (async () => {
      const dir = `${parentDir}/${name}`;
      const res = await window.studio.agents.register(dir);
      if (res.ok && res.agent) {
        await refreshAgents();
        await setActiveAgent(res.agent.id);
        setPhase("done");
        onClose();
      } else {
        const noProject = res.error?.includes("No package.json");
        setError(
          noProject
            ? "Couldn't scaffold the agent — setup didn't finish. Check the log below and make sure you're online: Eve and its runtime download automatically on first use."
            : (res.error ??
                "Scaffolding finished but the agent could not be registered."),
        );
        setPhase("error");
      }
    })();
  }, [
    exitCode,
    phase,
    parentDir,
    name,
    refreshAgents,
    setActiveAgent,
    onClose,
  ]);

  return (
    <Modal title="Create a new agent" onClose={onClose} width="max-w-xl">
      {phase === "form" || phase === "error" ? (
        <div className="space-y-3.5 p-4">
          <Field label="Location" hint="parent folder for the new agent">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={pickDir}
                className="no-drag flex flex-1 items-center gap-2 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-left text-[13px] text-muted hover:border-border-strong"
              >
                <IconFolder className="h-4 w-4 shrink-0 text-faint" />
                <span className="truncate">
                  {parentDir ?? "Choose a folder…"}
                </span>
              </button>
            </div>
          </Field>

          <Field label="Agent name" hint="lowercase, digits, . _ -">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-agent"
              className="font-mono"
            />
          </Field>

          <label className="flex items-center gap-2 text-[13px] text-muted">
            <input
              type="checkbox"
              checked={webChat}
              onChange={(e) => setWebChat(e.target.checked)}
              className="accent-accent"
            />
            Add a Web Chat app (Next.js)
          </label>

          {parentDir && validName ? (
            <div className="rounded-lg border border-border bg-subtle px-3 py-2.5">
              <Kicker className="mb-1.5">Command</Kicker>
              <div className="font-mono text-2xs text-muted">
                eve init {name}
                {webChat ? " --channel-web-nextjs" : ""}
                <span className="text-faint"> · in {parentDir}</span>
              </div>
            </div>
          ) : null}

          {phase === "error" && output ? (
            <div>
              <Kicker className="mb-1.5">eve init log</Kicker>
              <Console text={output} className="h-40" />
            </div>
          ) : null}

          {error ? <div className="text-xs text-danger">{error}</div> : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={create}
              disabled={!parentDir || !validName}
            >
              Create agent
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <Kicker>Scaffolding</Kicker>
          <div className="text-[13px] text-muted">
            Creating <span className="font-mono text-text">{name}</span> and
            installing dependencies…
          </div>
          <Console
            text={output}
            className="h-64"
            placeholder="Starting eve init…"
          />
        </div>
      )}
    </Modal>
  );
}
