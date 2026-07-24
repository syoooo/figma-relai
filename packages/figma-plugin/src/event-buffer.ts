// Buffers designer activity (selection / node / page changes) between AI
// commands so the AI learns what the designer did without polling. Events
// fired while a command executes are suppressed — those are self-edits.

export interface DesignerEvent {
  type: "selection_change" | "node_change" | "page_change";
  ts: number;
  nodeIds?: string[];
  names?: string[];
  pageName?: string;
}

const MAX_EVENTS = 20;
let events: DesignerEvent[] = [];
let executingCount = 0;

export function beginCommand(): void {
  executingCount++;
}

export function endCommand(): void {
  executingCount = Math.max(0, executingCount - 1);
}

export function pushEvent(event: DesignerEvent): void {
  if (executingCount > 0) return; // self-edit, not designer activity

  if (event.type === "selection_change") {
    // Only the latest selection matters
    events = events.filter((e) => e.type !== "selection_change");
  } else if (event.type === "node_change") {
    // Coalesce repeated changes to the same node set
    const key = (event.nodeIds ?? []).join(",");
    events = events.filter(
      (e) => e.type !== "node_change" || (e.nodeIds ?? []).join(",") !== key
    );
  }

  events.push(event);
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
}

export function drainEvents(): DesignerEvent[] {
  const drained = events;
  events = [];
  return drained;
}

