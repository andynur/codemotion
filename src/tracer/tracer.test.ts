import { describe, expect, test } from "bun:test";
import { presets } from "../presets";
import { traceSource } from "./runtime";
import { isTraceError } from "./types";

function trace(source: string, limit?: number) {
  const result = traceSource(source, limit);
  if (isTraceError(result)) throw new Error(`${result.code}: ${result.message}`);
  return result;
}

describe("tracer core", () => {
  test("captures variable declarations and assignments", () => {
    const result = trace("let count = 1; count = count + 2;");
    expect(result.at(-2)?.scopes.global.count).toBe(3);
    expect(result.some((step) => step.kind === "assignment")).toBe(true);
  });

  test("traces a counting for loop", () => {
    const result = trace("let total = 0; for (let i = 0; i < 3; i++) { total += i; }");
    expect(result.filter((step) => step.kind === "loop")).toHaveLength(3);
    expect(result.at(-1)?.scopes.global.total).toBe(3);
  });

  test("traces while with break", () => {
    const result = trace("let i = 0; while (true) { i++; if (i === 2) break; }");
    expect(result.some((step) => step.event.detail === "break")).toBe(true);
    expect(result.at(-1)?.scopes.global.i).toBe(2);
  });

  test("records if and else branch choices", () => {
    expect(trace("let x = 2; if (x > 1) x = 3; else x = 0;").some((step) => step.event.detail === "if")).toBe(true);
    expect(trace("let x = 0; if (x > 1) x = 3; else x = 4;").some((step) => step.event.detail === "else")).toBe(true);
  });

  test("captures push and pop", () => {
    const result = trace("const values = [1]; values.push(2); values.pop();");
    expect(result.filter((step) => step.kind === "array-mutation").map((step) => step.event.detail)).toEqual(["push", "pop"]);
  });

  test("captures an array swap", () => {
    const result = trace("const values = [1, 2]; const temp = values[0]; values[0] = values[1]; values[1] = temp;");
    expect(result.at(-1)?.scopes.global.values).toEqual([2, 1]);
  });

  test("captures function parameters, locals, and return values", () => {
    const result = trace(`function add(a, b) {
  const total = a + b;
  return total;
}
let result = add(2, 3);`);
    const declaration = result.find((step) => step.kind === "declaration" && step.event.detail === "total");
    const returned = result.find((step) => step.kind === "return");

    expect(declaration?.scopes.stack?.at(-1)).toMatchObject({ name: "add", locals: { a: 2, b: 3, total: 5 } });
    expect(returned?.event.returnValue).toBe(5);
    expect(result.at(-1)?.scopes.global.result).toBe(5);
  });

  test("keeps recursive calls as separate stack frames", () => {
    const result = trace("function factorial(n) { if (n <= 1) return 1; return n * factorial(n - 1); } let result = factorial(4);");
    const deepest = result.reduce((depth, step) => Math.max(depth, step.scopes.stack?.length ?? 0), 0);
    const returns = result.filter((step) => step.kind === "return").map((step) => step.event.returnValue);

    expect(deepest).toBe(4);
    expect(returns).toEqual([1, 2, 6, 24]);
    expect(result.at(-1)?.scopes.global.result).toBe(24);
  });

  test("rejects nested functions with a line number", () => {
    const result = traceSource("function outer() {\n  function inner() {}\n}");
    expect(result).toMatchObject({ error: true, code: "UNSUPPORTED_SYNTAX", line: 2 });
  });

  test("stops infinite loops at the step limit", () => {
    const result = traceSource("while (true) {}", 12);
    expect(isTraceError(result) && result.code).toBe("STEP_LIMIT");
    expect(!Array.isArray(result) && result.trace?.length).toBe(12);
  });

  test("reports unsupported syntax with a line", () => {
    const result = traceSource("let value = 1;\nclass Example {}");
    expect(result).toMatchObject({ error: true, code: "UNSUPPORTED_SYNTAX", line: 2 });
  });

  test("preset trace summaries stay stable", () => {
    const summary = presets.map((preset) => {
      const result = trace(preset.source);
      return { id: preset.id, steps: result.length, final: result.at(-1)?.scopes.global };
    });
    expect(summary).toMatchSnapshot();
  });
});
