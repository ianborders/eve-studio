import { useEffect, useState } from "react";
import { ConnectorPicker } from "../components/ConnectorPicker";
import { ConnectorsGallery } from "../components/ConnectorsGallery";
import { useActiveStructure } from "../lib/useStructure";
import {
  IconExternal,
  IconPlug,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "../ui/icons";
import {
  Badge,
  Button,
  Card,
  Field,
  IconButton,
  Input,
  Modal,
  Spinner,
  Textarea,
} from "../ui/kit";

type Kind = "mcp" | "openapi";
type AuthMode = "static" | "header" | "connect-user" | "connect-app" | "none";

const AUTH_LABELS: Record<AuthMode, string> = {
  static: "Static bearer token",
  header: "Custom header (API key)",
  "connect-user": "Vercel Connect (user OAuth)",
  "connect-app": "Vercel Connect (app OAuth)",
  none: "No auth",
};

function Pills<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`rounded-lg border px-2.5 py-1 text-2xs transition-colors ${
            value === o.id
              ? "border-text bg-text text-white"
              : "border-border text-muted hover:bg-hover"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AddConnectionModal({
  agentId,
  onClose,
}: {
  agentId: string;
  onClose: () => void;
}): JSX.Element {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("mcp");
  const [url, setUrl] = useState("");
  const [spec, setSpec] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [description, setDescription] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("static");
  const [envVar, setEnvVar] = useState("");
  const [headerName, setHeaderName] = useState("");
  const [connector, setConnector] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ path: string; env?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    const r = await window.studio.agents.addConnection(agentId, {
      name,
      kind,
      url: kind === "mcp" ? url : undefined,
      spec: kind === "openapi" ? spec : undefined,
      baseUrl: kind === "openapi" && baseUrl ? baseUrl : undefined,
      description,
      authMode,
      envVar: envVar || undefined,
      headerName: headerName || undefined,
      connector: connector || undefined,
    });
    setBusy(false);
    if (r.ok) {
      setDone({ path: r.relPath ?? "connection", env: (r as { envVar?: string }).envVar });
    } else {
      setErr(r.error ?? "Failed.");
    }
  };

  const needsEndpoint = kind === "mcp" ? Boolean(url) : Boolean(spec);
  const needsConnector = authMode.startsWith("connect") ? Boolean(connector) : true;

  return (
    <Modal title="Add connection" onClose={onClose} width="max-w-xl">
      {done ? (
        <div className="space-y-3 p-4">
          <div className="rounded-lg bg-success/10 px-3 py-2 text-[13px] text-success">
            Wrote <span className="font-mono">{done.path}</span>.
          </div>
          <p className="text-2xs leading-relaxed text-muted">
            {done.env ? (
              <>
                Set <span className="font-mono text-text">{done.env}</span> in the
                agent's .env (Environment tab), then restart it.
              </>
            ) : authMode.startsWith("connect") ? (
              <>
                Provision the connector with{" "}
                <span className="font-mono text-text">vercel connect create</span> and
                restart the agent.
              </>
            ) : (
              "Restart the agent to load the connection."
            )}
          </p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="max-h-[70vh] space-y-3 overflow-auto p-4">
          <Field label="Name" hint="becomes connections/<name>.ts">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="linear" className="font-mono" />
          </Field>

          <Field label="Kind">
            <Pills
              value={kind}
              onChange={setKind}
              options={[
                { id: "mcp", label: "MCP server" },
                { id: "openapi", label: "OpenAPI / REST" },
              ]}
            />
          </Field>

          {kind === "mcp" ? (
            <Field label="MCP URL" hint="Streamable HTTP or SSE">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp.example.com/mcp" className="font-mono" />
            </Field>
          ) : (
            <>
              <Field label="OpenAPI spec URL">
                <Input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="https://api.example.com/openapi.json" className="font-mono" />
              </Field>
              <Field label="Base URL" hint="optional override">
                <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" className="font-mono" />
              </Field>
            </>
          )}

          <Field label="Description" hint="written for the model — routing hint">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the agent can do here" />
          </Field>

          <Field label="Auth">
            <Pills
              value={authMode}
              onChange={setAuthMode}
              options={(Object.keys(AUTH_LABELS) as AuthMode[]).map((m) => ({
                id: m,
                label: AUTH_LABELS[m],
              }))}
            />
          </Field>

          {authMode === "static" ? (
            <Field label="Token env var" hint="Bearer — defaults to <NAME>_TOKEN">
              <Input value={envVar} onChange={(e) => setEnvVar(e.target.value)} placeholder="LINEAR_TOKEN" className="font-mono" />
            </Field>
          ) : null}
          {authMode === "header" ? (
            <>
              <Field label="Header name">
                <Input value={headerName} onChange={(e) => setHeaderName(e.target.value)} placeholder="X-Api-Key" className="font-mono" />
              </Field>
              <Field label="Value env var" hint="defaults to <NAME>_TOKEN">
                <Input value={envVar} onChange={(e) => setEnvVar(e.target.value)} placeholder="DOCS_API_KEY" className="font-mono" />
              </Field>
            </>
          ) : null}
          {authMode.startsWith("connect") ? (
            <Field label="Connector" hint="pick an existing Vercel Connect connector">
              <ConnectorPicker agentId={agentId} value={connector} onChange={setConnector} />
            </Field>
          ) : null}

          {err ? <div className="text-xs text-danger">{err}</div> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={submit}
              disabled={busy || !name || !needsEndpoint || !needsConnector}
            >
              {busy ? "Writing…" : "Add connection"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function Connections(): JSX.Element {
  const { id, structure, loading, reload } = useActiveStructure();
  const [addOpen, setAddOpen] = useState(false);
  const [editName, setEditName] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  if (loading && !structure) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }
  const conns = structure?.connections ?? [];
  const visibleConns = conns.filter((c) => !removed.has(c.name));

  const doDelete = async (): Promise<void> => {
    if (!id || !confirmDelete) {
      return;
    }
    setDeleting(true);
    await window.studio.agents.deleteConnection(id, confirmDelete);
    setRemoved((s) => new Set(s).add(confirmDelete));
    setDeleting(false);
    setConfirmDelete(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
        <div className="text-[13px] font-medium text-text">Connections</div>
        <IconButton onClick={reload} title="Reload">
          <IconRefresh className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      <div className="flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-3xl space-y-6">
          {id ? <ConnectorsGallery agentId={id} /> : null}

          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-t border-border pt-5">
              <div>
                <div className="text-2xs font-medium uppercase tracking-wide text-faint">
                  Custom connections · MCP / OpenAPI
                </div>
                <div className="text-2xs text-muted">
                  Connection files the agent authors under
                  <span className="font-mono"> connections/</span> (like Arcana).
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)} disabled={!id}>
                <IconPlus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            {visibleConns.length === 0 ? (
              <Card className="flex flex-col items-center gap-3 p-8 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted">
                  <IconPlug className="h-4 w-4" />
                </div>
                <div className="text-[13px] text-muted">
                  No custom connections yet — wire an MCP server or OpenAPI API
                  directly.
                </div>
                <Button variant="primary" size="sm" onClick={() => setAddOpen(true)} disabled={!id}>
                  <IconPlus className="h-3.5 w-3.5" />
                  Add connection
                </Button>
              </Card>
            ) : (
              visibleConns.map((c) => (
                <Card key={c.name} className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/[0.04] text-muted">
                      <IconPlug className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] text-text">{c.name}</span>
                        {c.protocol ? <Badge tone="info">{c.protocol}</Badge> : null}
                      </div>
                      {c.url ? (
                        <div className="mt-0.5 flex items-center gap-1 truncate font-mono text-2xs text-faint">
                          <IconExternal className="h-3 w-3 shrink-0" />
                          {c.url}
                        </div>
                      ) : null}
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => setEditName(c.name)}>
                      Open
                    </Button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(c.name)}
                      className="rounded-md p-1.5 text-faint hover:bg-danger/10 hover:text-danger"
                      title="Delete"
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {c.description ? (
                    <p className="mt-2.5 text-[13px] leading-relaxed text-muted">
                      {c.description}
                    </p>
                  ) : null}
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      {addOpen && id ? (
        <AddConnectionModal agentId={id} onClose={() => setAddOpen(false)} />
      ) : null}

      {editName && id ? (
        <EditConnectionModal
          agentId={id}
          name={editName}
          onClose={() => setEditName(null)}
        />
      ) : null}

      {confirmDelete ? (
        <Modal title="Delete connection" onClose={() => setConfirmDelete(null)}>
          <div className="space-y-3 p-4">
            <p className="text-[13px] text-muted">
              Delete <span className="font-mono text-text">connections/{confirmDelete}.ts</span>?
              This removes the file. Restart the agent to apply.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={doDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function EditConnectionModal({
  agentId,
  name,
  onClose,
}: {
  agentId: string;
  name: string;
  onClose: () => void;
}): JSX.Element {
  const [content, setContent] = useState<string | null>(null);
  const [original, setOriginal] = useState("");
  const [relPath, setRelPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const f = await window.studio.agents.readConnection(agentId, name);
      setContent(f.content);
      setOriginal(f.content);
      setRelPath(f.relPath);
    })();
  }, [agentId, name]);

  const dirty = content !== null && content !== original;

  const save = async (): Promise<void> => {
    if (content === null) {
      return;
    }
    setSaving(true);
    setErr(null);
    const r = await window.studio.agents.writeConnection(agentId, name, content);
    setSaving(false);
    if (r.ok) {
      setOriginal(content);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } else {
      setErr(r.error ?? "Failed to save.");
    }
  };

  return (
    <Modal title={`Edit ${name}`} onClose={onClose} width="max-w-2xl">
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2 font-mono text-2xs text-faint">
          {relPath}
          <div className="flex-1" />
          {dirty ? <span className="text-warn">unsaved</span> : null}
          {saved ? <span className="text-success">saved ✓</span> : null}
        </div>
        {content === null ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="h-72 resize-none font-mono text-[12px]"
          />
        )}
        {err ? <div className="text-xs text-danger">{err}</div> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
