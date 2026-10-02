import { describe, expect, test } from "bun:test";
import { presets } from "../presets";
import { resolveNode, tracePath } from "../stage/flowModel";
import { narrate } from "../stage/narrate";
import { buildFlow } from "./flow";
import { traceSource } from "./runtime";
import { isTraceError } from "./types";

function traced(source: string) {
  const result = traceSource(source);
  if (isTraceError(result)) throw new Error(`${result.code}: ${result.message}`);
  return result;
}

describe("flowchart", () => {
  test("every preset step maps to a flowchart node", () => {
    for (const preset of presets) {
      const trace = traced(preset.source);
      const flow = buildFlow(preset.source);
      const unresolved = trace.filter((_, index) => !resolveNode(trace, index, flow));
      expect({ id: preset.id, unresolved: unresolved.length }).toEqual({ id: preset.id, unresolved: 0 });
    }
  });

  test("a while loop draws true, false and loop-back edges", () => {
    const flow = buildFlow("let i = 0;\nwhile (i < 3) {\n  i++;\n}\nconsole.log(i);");
    expect(flow.nodes.map((node) => node.kind)).toEqual(["terminal", "process", "decision", "process", "io", "terminal"]);
    expect(new Set(flow.edges.map((edge) => edge.kind))).toEqual(new Set(["flow", "true", "false", "loop"]));
    const decision = flow.nodes.find((node) => node.kind === "decision")!;
    expect(decision.label).toBe("i < 3");
    expect(flow.edges.find((edge) => edge.kind === "loop")?.to).toBe(decision.id);
  });

  test("moving between consecutive loop steps follows drawn edges", () => {
    const source = "let total = 0;\nfor (let i = 0; i < 3; i++) {\n  total += i;\n}";
    const trace = traced(source);
    const path = tracePath(trace, buildFlow(source));
    const moves = path.nodes.filter((node, index) => index > 0 && node !== path.nodes[index - 1]).length;
    expect(path.edges.filter(Boolean)).toHaveLength(moves);
  });

  test("functions get their own column with start and end terminals", () => {
    const flow = buildFlow("function add(a, b) {\n  return a + b;\n}\nconst sum = add(1, 2);");
    expect(flow.nodes.filter((node) => node.kind === "terminal").map((node) => node.label)).toEqual(["start", "end", "add(a, b)", "return from add"]);
  });

  test("narration explains conditions with the node label", () => {
    const source = "let i = 0;\nwhile (i < 1) {\n  i++;\n}";
    const trace = traced(source);
    const index = trace.findIndex((step) => step.kind === "condition");
    expect(narrate(trace, index, "i < 1")).toMatchObject({ note: "// i < 1 → true", tone: "true" });
    const assignment = trace.findIndex((step) => step.kind === "assignment");
    expect(narrate(trace, assignment).note).toBe("// i: 0 → 1");
  });
});
