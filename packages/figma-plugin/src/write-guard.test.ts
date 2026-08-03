import { describe, expect, test } from "bun:test";
import {
  isWriteCommand,
  collectNodeRefs,
  nodeIdsInText,
  needsApproval,
  describeScale,
  migrateConfirmLevel,
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

describe("needsApproval (four-stop dial)", () => {
  const many = { nodeIds: Array.from({ length: 12 }, (_, i) => `1:${i}`) };

  test("open never asks — even for ghost-making deletes", () => {
    expect(needsApproval("open", "execute_code", {})).toBe(false);
    expect(needsApproval("open", "delete_variable", { variableId: "V:1" })).toBe(false);
    expect(needsApproval("open", "delete_multiple_nodes", many)).toBe(false);
  });

  test("risk asks only for the reversibility tax", () => {
    expect(needsApproval("risk", "delete_variable", { variableId: "V:1" })).toBe(true);
    expect(needsApproval("risk", "delete_style", { styleId: "S:1" })).toBe(true);
    expect(needsApproval("risk", "detach_instance", { nodeId: "1:1" })).toBe(true);
    expect(needsApproval("risk", "flatten_node", { nodeId: "1:1" })).toBe(true);
    expect(needsApproval("risk", "delete_multiple_nodes", many)).toBe(true);
    expect(needsApproval("risk", "execute_code", {})).toBe(false);
    expect(needsApproval("risk", "set_fill_color", { nodeId: "1:1" })).toBe(false);
  });

  test("all asks for any write but never for reads", () => {
    expect(needsApproval("all", "set_fill_color", { nodeId: "1:1" })).toBe(true);
    expect(needsApproval("all", "get_node_info", { nodeId: "1:1" })).toBe(false);
  });

  test("bulk: tax + code exec, drift fixes, big batches, wide fan-outs", () => {
    expect(needsApproval("bulk", "delete_variable", { variableId: "V:1" })).toBe(true);
    expect(needsApproval("bulk", "execute_code", {})).toBe(true);
    expect(needsApproval("bulk", "scan_token_drift", { fix: true })).toBe(true);
    expect(
      needsApproval("bulk", "batch_execute", {
        commands: Array.from({ length: 10 }, () => ({ command: "x" })),
      })
    ).toBe(true);
    expect(needsApproval("bulk", "delete_multiple_nodes", many)).toBe(true);
  });

  test("bulk lets small writes through silently", () => {
    expect(needsApproval("bulk", "set_fill_color", { nodeId: "1:1" })).toBe(false);
    expect(
      needsApproval("bulk", "batch_execute", { commands: [{ command: "x" }, { command: "y" }] })
    ).toBe(false);
  });
});

describe("migrateConfirmLevel", () => {
  test("legacy pairs map onto the dial", () => {
    expect(migrateConfirmLevel(undefined, undefined)).toBe("risk");
    expect(migrateConfirmLevel("off", false)).toBe("open");
    expect(migrateConfirmLevel("off", true)).toBe("risk");
    expect(migrateConfirmLevel("bulk", undefined)).toBe("bulk");
    expect(migrateConfirmLevel("all", false)).toBe("all");
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

describe("nodeIdsInText", () => {
  test("plain ids", () => {
    expect(nodeIdsInText('{"id":"1234:5678"}')).toEqual(["1234:5678"]);
  });

  test("an instance sublayer is ONE id, not two", () => {
    // The bug: /\d+:\d+/ also matched 4866:4085 — the MAIN COMPONENT — out of
    // the middle. The component lives on the Icon page, so editing an override
    // on the Date Field page was reported as touching a guarded page.
    expect(nodeIdsInText('"I4518:19131;4866:4085"')).toEqual(["I4518:19131;4866:4085"]);
  });

  test("deeply nested instance paths stay whole", () => {
    expect(nodeIdsInText('"I5059:9802;2318:18444;2318:18844;5739:9613"')).toEqual([
      "I5059:9802;2318:18444;2318:18844;5739:9613",
    ]);
  });

  test("real ids next to an instance path are all found, once each", () => {
    const text = '{"a":"6839:27488","b":"I6172:21334;4901:4576","c":"6839:27488"}';
    expect(nodeIdsInText(text)).toEqual(["6839:27488", "I6172:21334;4901:4576"]);
  });

  test("respects the cap", () => {
    const many = Array.from({ length: 30 }, (_, i) => `"${i}:${i}"`).join(",");
    expect(nodeIdsInText(many, 5)).toHaveLength(5);
  });

  test("text with no ids yields nothing", () => {
    expect(nodeIdsInText('{"ok":true,"ratio":4.02}')).toEqual([]);
  });
});
