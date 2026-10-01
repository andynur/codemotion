/// <reference lib="webworker" />
import { traceSource } from "./runtime";

interface RunMessage { id: number; source: string; stepLimit: number }

self.onmessage = (event: MessageEvent<RunMessage>) => {
  const { id, source, stepLimit } = event.data;
  self.postMessage({ id, result: traceSource(source, stepLimit) });
};
