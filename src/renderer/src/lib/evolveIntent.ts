/**
 * Cheap, local heuristic: does a chat message look like a request to change the
 * agent itself (create a skill/tool/schedule, edit behavior, remember a fact)?
 *
 * @remarks
 * Intentionally conservative and zero-cost — it only decides whether to *offer*
 * an "Evolve this" affordance. The real classification + drafting runs the model
 * (via `evolve.draft`) and only after the user clicks. False positives cost a
 * dismissable chip; false negatives just mean the user uses the Evolve tab.
 */
const PATTERNS: RegExp[] = [
  // "create / make / build / add a skill|tool|schedule|cron|automation"
  /\b(create|make|build|add|set up|write)\b[^.?!]*\b(skill|tool|schedule|cron|automation|workflow)\b/i,
  // "remember (that) ..." — a durable fact
  /\bremember\b/i,
  // behavior/persona edits
  /\b(from now on|going forward|always|never)\b/i,
  /\byou should (always|never|start|stop)\b/i,
  // recurring / proactive work
  /\b(every|each)\s+(morning|day|night|week|weekday|hour|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bat \d{1,2}\s?(am|pm|:\d{2})\b[^.?!]*\b(dm|message|post|send|slack|email)\b/i,
  // explicit self-reference to changing capabilities
  /\b(teach yourself|give yourself|update your (instructions|behavior)|change what you know)\b/i,
];

/** True when `text` plausibly asks the agent to modify itself. */
export function looksLikeEvolveIntent(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) {
    return false;
  }
  return PATTERNS.some((re) => re.test(t));
}
