import { instrument, UnsupportedSyntaxError } from "./instrument";
import type { CallFrame, SnapshotValue, Step, Trace, TraceError, TraceResult } from "./types";

class StepLimitError extends Error {}

function cloneValue(value: unknown, seen = new WeakSet<object>()): SnapshotValue {
  if (value === null || ["string", "number", "boolean", "undefined"].includes(typeof value)) return value as SnapshotValue;
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") return String(value);
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => cloneValue(item, seen));
  const output: Record<string, SnapshotValue> = {};
  for (const [key, item] of Object.entries(value)) output[key] = cloneValue(item, seen);
  return output;
}

interface Meta { line: number; col: number; kind: Step["kind"]; detail?: string }

export function executeInstrumented(code: string, stepLimit = 5_000): TraceResult {
  const trace: Trace = [];
  const outputs: string[] = [];
  let nextFrameId = 0;
  let globalScope: Record<string, SnapshotValue> = {};
  const stack: (CallFrame & { localNames: Set<string> })[] = [];
  const safeValue = (read: () => unknown) => {
    try { return read(); } catch { return undefined; }
  };
  const record = (meta: Meta, capture: () => Record<string, unknown>, override?: boolean) => {
    if (trace.length >= stepLimit) throw new StepLimitError(`Execution exceeded the ${stepLimit.toLocaleString()} step limit`);
    const captured = cloneValue(capture()) as Record<string, SnapshotValue>;
    const frame = stack.at(-1);
    if (frame) {
      frame.locals = Object.fromEntries(Object.entries(captured).filter(([name]) => frame.localNames.has(name)));
      globalScope = Object.fromEntries(Object.entries(captured).filter(([name]) => !frame.localNames.has(name)));
    } else {
      globalScope = captured;
    }
    const heap = Object.fromEntries(Object.entries({ ...globalScope, ...(frame?.locals ?? {}) }).filter(([, value]) => Array.isArray(value) || (value && typeof value === "object")));
    const scopeStack = stack.map(({ localNames: _localNames, ...item }) => cloneValue(item) as unknown as CallFrame);
    trace.push({
      id: trace.length,
      line: meta.line,
      col: meta.col,
      kind: meta.kind,
      scopes: stack.length ? { global: cloneValue(globalScope) as Record<string, SnapshotValue>, stack: scopeStack } : { global: cloneValue(globalScope) as Record<string, SnapshotValue> },
      heap,
      event: { kind: meta.kind, detail: override ?? meta.detail },
    });
  };
  const test = (value: unknown, meta: Meta, capture: () => Record<string, unknown>) => {
    record(meta, capture, Boolean(value));
    return value;
  };
  const enter = (meta: Meta, name: string, localNames: string[], capture: () => Record<string, unknown>) => {
    stack.push({ id: nextFrameId++, name, line: meta.line, locals: {}, localNames: new Set(localNames) });
    record(meta, capture);
  };
  const leave = (value: unknown, meta: Meta, capture: () => Record<string, unknown>) => {
    record(meta, capture);
    trace.at(-1)!.event.returnValue = cloneValue(value);
    stack.pop();
    return value;
  };
  const scopedConsole = {
    log: (...values: unknown[]) => {
      const output = values.map((value) => typeof value === "string" ? value : JSON.stringify(cloneValue(value))).join(" ");
      outputs.push(output);
      if (trace.length >= stepLimit) throw new StepLimitError(`Execution exceeded the ${stepLimit.toLocaleString()} step limit`);
      const previous = trace.at(-1);
      trace.push({
        id: trace.length,
        line: previous?.line ?? 1,
        col: 0,
        kind: "console",
        scopes: cloneValue(previous?.scopes ?? { global: {} }) as Step["scopes"],
        heap: cloneValue(previous?.heap ?? {}) as Record<string, SnapshotValue>,
        event: { kind: "console", output },
      });
    },
  };

  try {
    const run = new Function("__trace", "__traceTest", "__value", "__enter", "__return", "console", `"use strict";\n${code}`);
    run(record, test, safeValue, enter, leave, scopedConsole);
    return trace;
  } catch (error) {
    const isLimit = error instanceof StepLimitError;
    return { error: true, code: isLimit ? "STEP_LIMIT" : "RUNTIME_ERROR", message: error instanceof Error ? error.message : String(error), trace };
  }
}

export function traceSource(source: string, stepLimit = 5_000): TraceResult {
  try {
    return executeInstrumented(instrument(source).code, stepLimit);
  } catch (error) {
    const line = error instanceof UnsupportedSyntaxError ? error.line : (error as { loc?: { line?: number } })?.loc?.line;
    const unsupported = error instanceof UnsupportedSyntaxError;
    return { error: true, code: unsupported ? "UNSUPPORTED_SYNTAX" : "PARSE_ERROR", message: error instanceof Error ? error.message : String(error), line } satisfies TraceError;
  }
}
