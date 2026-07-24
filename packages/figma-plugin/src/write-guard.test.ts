import { describe, expect, test } from "bun:test";
import {
  isWriteCommand,
  collectNodeRefs,
  needsApproval,
  describeScale,
} from "./write-guard.js";

describe("isWriteCommand", () => {
  test("reads and navigation are not writes", () => {
    for (const cmd of [
      "get_node_info",
      "get_design_system",
      "read_my_design",
      "find_nodes",
      "export_node_as_image",
      "scan_text_nodes",
      "scan_nodes_by_types",
      "set_focus",
      "set_selections",
      "set_viewport",
      "figma_notify",
      "audit_colors",
      "find_orphan_instances",
    ]) {
      expect(isWriteCommand(cmd, {})).toBe(false);
    }
  });

  test("mutations are writes", () => {
    for (const cmd of ["create_frame", "set_fill_color", "set_fills", "reset_instance", "delete_node", "execute_code", "batch_execute"]) {
      expect(isWriteCommand(cmd, {})).toBe(true);
    }
  });

  test("scan_token_drift is a write only when fixing", () => {
    expect(isWriteCommand("scan_token_drift", {})).toBe(false);
    expect(isWriteCommand("scan_token_drift", { fix: true })).toBe(true);
  });
});

describe("collectNodeRefs", () => {
  test("gathers string and array refs, ignores the rest", () => {
    expect(
      collectNodeRefs({
        nodeId: "1:1",
        targetNodeIds: ["2:1", "2:2"],
        parentId: "3:1",
        commandId: "ignored-key",
        count: 5,
      })
    ).toEqual(["1:1", "2:1", "2:2", "3:1"]);
  });
});

describe("needsApproval", () => {
  const many = { nodeIds: Array.from({ length: 12 }, (_, i) => `1:${i}`) };

  test("off mode never asks", () => {
    expect(needsApproval("off", "execute_code", {})).toBe(false);
    expect(needsApproval("off", "delete_node", many)).toBe(false);
  });

  test("all mode asks for any write but never for reads", () => {
    expect(needsApproval("all", "set_fill_color", { nodeId: "1:1" })).toBe(true);
    expect(needsApproval("all", "get_node_info", { nodeId: "1:1" })).toBe(false);
  });

  test("bulk mode: code exec, drift fixes, big batches, wide fan-outs", () => {
    expect(needsApproval("bulk", "execute_code", {})).toBe(true);
    expect(needsApproval("bulk", "scan_token_drift", { fix: true })).toBe(true);
    expect(
      needsApproval("bulk", "batch_execute", {
        commands: Array.from({ length: 10 }, () => ({ command: "x" })),
      })
    ).toBe(true);
    expect(needsApproval("bulk", "delete_multiple_nodes", many)).toBe(true);
  });

  test("bulk mode lets small writes through silently", () => {
    expect(needsApproval("bulk", "set_fill_color", { nodeId: "1:1" })).toBe(false);
    expect(
      needsApproval("bulk", "batch_execute", { commands: [{ command: "x" }, { command: "y" }] })
    ).toBe(false);
  });
});

describe("describeScale", () => {
  test("batches count commands, fan-outs count nodes", () => {
    expect(describeScale("batch_execute", { commands: [{}, {}, {}] })).toBe("3 commands");
    expect(describeScale("set_instance_overrides", { targetNodeIds: ["a", "b"] })).toBe("2 nodes");
    expect(describeScale("delete_node", { nodeId: "1:1" })).toBe("1 node");
    expect(describeScale("execute_code", {})).toBe("");
  });
});
