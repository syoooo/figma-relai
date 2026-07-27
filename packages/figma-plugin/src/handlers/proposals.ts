// Rule-promotion proposals — the loop's refinement arm. The agent reads the
// file's prose law, spots an enforceable sentence ("never touch the Cover
// page"), and PROPOSES turning it into enforcement. Nothing activates until
// the designer accepts on the panel — prose compiles to law only by nod.

import { registerHandler } from "../dispatcher.js";
import { readGuards } from "./guards.js";

export interface RuleProposal {
  id: string;
  kind: "page_guard";
  pages: Array<{ id: string; name: string }>;
  reason: string;
}

export const pendingProposals = new Map<string, RuleProposal>();

registerHandler("propose_rule", async (params) => {
  const kind = params.kind;
  if (kind !== "page_guard")
    throw new Error(`Unknown proposal kind "${String(kind)}" — v1 supports "page_guard".`);
  const reason = typeof params.reason === "string" ? params.reason.trim() : "";
  if (!reason)
    throw new Error("A reason is required — quote the conventions/precedent sentence this comes from.");
  const ids = Array.isArray(params.pageIds) ? (params.pageIds as string[]) : [];
  if (!ids.length) throw new Error("pageIds is required.");

  const guarded = new Set(readGuards().pages);
  const pages: Array<{ id: string; name: string }> = [];
  for (const id of ids.slice(0, 10)) {
    const page = figma.root.children.find((p) => p.id === id);
    if (page && !guarded.has(page.id)) pages.push({ id: page.id, name: page.name });
  }
  if (!pages.length) {
    return { proposed: false, note: "Every named page is already guarded or missing — nothing to propose." };
  }

  const proposal: RuleProposal = {
    id: Math.random().toString(36).slice(2, 10),
    kind: "page_guard",
    pages,
    reason,
  };
  pendingProposals.set(proposal.id, proposal);
  figma.ui.postMessage({ type: "rule-proposal", ...proposal });
  return {
    proposed: true,
    id: proposal.id,
    pages: pages.map((p) => p.name),
    note: "Shown on the panel — the designer decides; do not wait for the verdict.",
  };
});
