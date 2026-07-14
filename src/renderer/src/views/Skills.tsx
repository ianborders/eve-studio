import { useActiveStructure } from "../lib/useStructure";
import { IconRefresh, IconWand } from "../ui/icons";
import { Card, EmptyState, IconButton, Spinner } from "../ui/kit";

export function Skills(): JSX.Element {
  const { structure, loading, reload } = useActiveStructure();

  if (loading && !structure) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }
  const skills = structure?.skills ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
        <div className="text-[13px] font-medium text-text">
          Skills <span className="text-faint">· {skills.length}</span>
        </div>
        <IconButton onClick={reload} title="Reload">
          <IconRefresh className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {skills.length === 0 ? (
          <EmptyState icon={<IconWand className="h-5 w-5" />} title="No skills">
            Skills are load-on-demand instructions. Add them as
            <code className="mx-1 rounded bg-white/5 px-1 font-mono text-xs">
              skills/&lt;name&gt;/SKILL.md
            </code>
            with a description in frontmatter.
          </EmptyState>
        ) : (
          <div className="mx-auto max-w-3xl space-y-2.5">
            {skills.map((s) => (
              <Card key={s.name} className="p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet/10 text-violet">
                    <IconWand className="h-4 w-4" />
                  </div>
                  <span className="text-[13px] font-medium text-text">{s.name}</span>
                </div>
                {s.description ? (
                  <p className="mt-2.5 text-[13px] leading-relaxed text-muted">
                    {s.description}
                  </p>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
