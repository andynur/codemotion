import type { FlowGraph, Step, Trace } from "../tracer/types";

const position = (step: Step) => `${step.line}:${step.col}`;

/** Finds the flowchart node a trace step belongs to, or undefined when it has none. */
export function resolveNode(trace: Trace, index: number, flow: FlowGraph): string | undefined {
  const step = trace[index];
  if (!step) return undefined;
  const { lookup } = flow;
  // console.log output is recorded just before the statement's own step, so borrow that step's node.
  if (step.event.output !== undefined) {
    const next = trace[index + 1];
    return next?.kind === "console" && next.event.output === undefined ? resolveNode(trace, index + 1, flow) : resolveNode(trace, index - 1, flow);
  }
  const at = position(step);
  switch (step.kind) {
    case "program": return lookup[step.event.detail === "end" ? "end" : "start"];
    case "condition": return lookup[`cond:${at}`] ?? lookup[`line:${step.line}`];
    case "loop": return lookup[`loop:${at}`] ?? lookup[`line:${step.line}`];
    case "branch": return lookup[`branch:${at}`] ?? lookup[`line:${step.line}`];
    case "call": return lookup[`call:${at}`];
    case "return": return lookup[`ret:${at}`] ?? lookup[`stmt:${at}`] ?? lookup[`line:${step.line}`];
    default: return lookup[`stmt:${at}`] ?? lookup[`line:${step.line}`];
  }
}

export interface FlowPath {
  /** Node for every step, carried forward when a step has no node of its own. */
  nodes: (string | undefined)[];
  /** Edge travelled to reach each step's node, if the move follows a drawn edge. */
  edges: (string | undefined)[];
}

export function tracePath(trace: Trace, flow: FlowGraph): FlowPath {
  const edgeIndex = new Map<string, string>();
  for (const edge of flow.edges) {
    const key = `${edge.from}>${edge.to}`;
    if (!edgeIndex.has(key)) edgeIndex.set(key, edge.id);
  }
  const nodes: (string | undefined)[] = [];
  const edges: (string | undefined)[] = [];
  let previous: string | undefined;
  for (let index = 0; index < trace.length; index++) {
    const node = resolveNode(trace, index, flow) ?? previous;
    nodes.push(node);
    edges.push(previous && node && previous !== node ? edgeIndex.get(`${previous}>${node}`) : undefined);
    previous = node;
  }
  return { nodes, edges };
}
