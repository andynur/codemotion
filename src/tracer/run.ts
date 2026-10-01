import type { TraceResult } from "./types";
import { embeddedWorkerSource } from "./worker-source";

let requestId = 0;

export function runCode(source: string, options: { stepLimit?: number; timeoutMs?: number } = {}): Promise<TraceResult> {
  const id = ++requestId;
  const workerUrl = embeddedWorkerSource
    ? URL.createObjectURL(new Blob([embeddedWorkerSource], { type: "text/javascript" }))
    : new URL("tracer.worker.js", document.baseURI).href;
  const worker = new Worker(workerUrl, { type: "module" });
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      worker.terminate();
      if (embeddedWorkerSource) URL.revokeObjectURL(workerUrl);
      resolve({ error: true, code: "TIMEOUT", message: `Execution exceeded the ${options.timeoutMs ?? 2_000}ms time limit` });
    }, options.timeoutMs ?? 2_000);
    worker.onmessage = (event: MessageEvent<{ id: number; result: TraceResult }>) => {
      if (event.data.id !== id) return;
      clearTimeout(timer);
      worker.terminate();
      if (embeddedWorkerSource) URL.revokeObjectURL(workerUrl);
      resolve(event.data.result);
    };
    worker.onerror = (event) => {
      clearTimeout(timer);
      worker.terminate();
      if (embeddedWorkerSource) URL.revokeObjectURL(workerUrl);
      resolve({ error: true, code: "RUNTIME_ERROR", message: event.message || "The trace worker failed" });
    };
    worker.postMessage({ id, source, stepLimit: options.stepLimit ?? 5_000 });
  });
}
