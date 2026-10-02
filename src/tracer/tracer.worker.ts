/// <reference lib="webworker" />
import { buildFlow } from "./flow";
import { traceSource } from "./runtime";
import type { FlowGraph } from "./types";

interface RunMessage { id: number; source: string; stepLimit: number }

function flowFor(source: string): FlowGraph | undefined {
  try { return buildFlow(source); } catch { return undefined; }
}

self.onmessage = (event: MessageEvent<RunMessage>) => {
  const { id, source, stepLimit } = event.data;
  const result = traceSource(source, stepLimit);
  self.postMessage({ id, result, flow: flowFor(source) });
};
