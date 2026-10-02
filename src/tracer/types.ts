export type Primitive = string | number | boolean | null | undefined;
export type SnapshotValue = Primitive | SnapshotValue[] | { [key: string]: SnapshotValue };

export type EventKind =
  | "program"
  | "declaration"
  | "assignment"
  | "condition"
  | "branch"
  | "loop"
  | "array-mutation"
  | "console"
  | "control"
  | "call"
  | "return";

export interface TraceEvent {
  kind: EventKind;
  detail?: string | number | boolean;
  output?: string;
  returnValue?: SnapshotValue;
}

export interface CallFrame {
  id: number;
  name: string;
  line: number;
  locals: Record<string, SnapshotValue>;
}

export interface Step {
  id: number;
  line: number;
  col: number;
  kind: EventKind;
  scopes: { global: Record<string, SnapshotValue>; stack?: CallFrame[] };
  heap: Record<string, SnapshotValue>;
  event: TraceEvent;
}

export type Trace = Step[];

export interface TraceError {
  error: true;
  code: "PARSE_ERROR" | "UNSUPPORTED_SYNTAX" | "RUNTIME_ERROR" | "STEP_LIMIT" | "TIMEOUT";
  message: string;
  line?: number;
  trace?: Trace;
}

export type TraceResult = Trace | TraceError;

export type FlowNodeKind = "terminal" | "process" | "io" | "decision";
export type FlowEdgeKind = "flow" | "true" | "false" | "loop";

export interface FlowNode {
  id: string;
  kind: FlowNodeKind;
  label: string;
  /** Center x and top y in flowchart units. */
  x: number;
  y: number;
  w: number;
  h: number;
  line: number;
}

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  kind: FlowEdgeKind;
  d: string;
  label?: string;
  labelAt?: [number, number];
  labelAnchor?: "start" | "middle" | "end";
}

export interface FlowGraph {
  width: number;
  height: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** Maps trace positions such as `stmt:3:2` or `cond:4:9` to node ids. */
  lookup: Record<string, string>;
}

export interface RunOutput { result: TraceResult; flow?: FlowGraph }

export const isTraceError =(result: TraceResult): result is TraceError => !Array.isArray(result);
