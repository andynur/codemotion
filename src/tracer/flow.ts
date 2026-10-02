import { parse } from "acorn";
import { generate } from "astring";
import type { FlowEdge, FlowEdgeKind, FlowGraph, FlowNode, FlowNodeKind } from "./types";

type Node = Record<string, any> & { type: string; loc?: { start: { line: number; column: number } } };
type Point = [number, number];

interface Exit { from: string; kind: FlowEdgeKind; points: Point[]; label?: string }
interface PendingEdge { from: string; to: string; kind: FlowEdgeKind; points: Point[]; label?: string }
interface Block {
  left: number;
  right: number;
  height: number;
  entry?: string;
  entryLabel?: string;
  nodes: FlowNode[];
  edges: PendingEdge[];
  exits: Exit[];
  breaks: Exit[];
  continues: Exit[];
  returns: Exit[];
}

// Flowchart geometry, in SVG user units.
const GAP_Y = 36;
const GAP_X = 36;
const LANE = 24;
const MARGIN = 24;
const CHAR = 7.4;
const NODE_H = 40;
const TERMINAL_H = 36;
const DIAMOND_H = 64;
const MAX_LABEL = 30;

const loc = (node: Node) => `${node.loc?.start.line ?? 1}:${node.loc?.start.column ?? 0}`;
const lineOf = (node: Node) => node.loc?.start.line ?? 1;

function code(node: Node) {
  const text = generate(node as never).replace(/\s+/g, " ").trim().replace(/;$/, "");
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text;
}

function emptyBlock(): Block {
  return { left: 0, right: 0, height: 0, nodes: [], edges: [], exits: [], breaks: [], continues: [], returns: [] };
}

const shift = (points: Point[], dx: number, dy: number) => points.map(([x, y]) => [x + dx, y + dy] as Point);
const shiftExits = (exits: Exit[], dx: number, dy: number) => exits.map((exit) => ({ ...exit, points: shift(exit.points, dx, dy) }));

function translate(block: Block, dx: number, dy: number): Block {
  return {
    ...block,
    left: block.left + dx,
    right: block.right + dx,
    nodes: block.nodes.map((node) => ({ ...node, x: node.x + dx, y: node.y + dy })),
    edges: block.edges.map((edge) => ({ ...edge, points: shift(edge.points, dx, dy) })),
    exits: shiftExits(block.exits, dx, dy),
    breaks: shiftExits(block.breaks, dx, dy),
    continues: shiftExits(block.continues, dx, dy),
    returns: shiftExits(block.returns, dx, dy),
  };
}

/** Routes an open exit down to `target`, bending once halfway when the columns differ. */
function connect(exit: Exit, to: string, target: Point, label?: string): PendingEdge {
  const last = exit.points.at(-1)!;
  const route: Point[] = last[0] === target[0] ? [target] : [[last[0], (last[1] + target[1]) / 2], [target[0], (last[1] + target[1]) / 2], target];
  return { from: exit.from, to, kind: exit.kind, points: [...exit.points, ...route], label: exit.label ?? label };
}

const extend = (exits: Exit[], bottom: number) => exits.map((exit) => {
  const last = exit.points.at(-1)!;
  return last[1] >= bottom ? exit : { ...exit, points: [...exit.points, [last[0], bottom] as Point] };
});

class Builder {
  private count = 0;
  readonly lookup: Record<string, string> = {};

  node(kind: FlowNodeKind, label: string, line: number, keys: string[]): FlowNode {
    const id = `n${this.count++}`;
    const textWidth = label.length * CHAR;
    const w = kind === "decision" ? Math.max(128, textWidth + 64) : Math.max(kind === "terminal" ? 80 : 96, textWidth + 32);
    const h = kind === "decision" ? DIAMOND_H : kind === "terminal" ? TERMINAL_H : NODE_H;
    for (const key of keys) this.lookup[key] ??= id;
    this.lookup[`line:${line}`] ??= id;
    return { id, kind, label, x: 0, y: 0, w, h, line };
  }

  single(node: FlowNode): Block {
    return { ...emptyBlock(), left: -node.w / 2, right: node.w / 2, height: node.h, entry: node.id, nodes: [node], exits: [{ from: node.id, kind: "flow", points: [[0, node.h]] }] };
  }

  sequence(blocks: Block[]): Block {
    const out = emptyBlock();
    let pending: Exit[] = [];
    let y = 0;
    for (const block of blocks) {
      if (!block.entry) continue;
      const top = out.entry ? y + GAP_Y : 0;
      const moved = translate(block, 0, top);
      for (const exit of pending) out.edges.push(connect(exit, moved.entry!, [0, top], moved.entryLabel));
      if (!out.entry) {
        out.entry = moved.entry;
        out.entryLabel = moved.entryLabel;
      }
      out.nodes.push(...moved.nodes);
      out.edges.push(...moved.edges);
      out.breaks.push(...moved.breaks);
      out.continues.push(...moved.continues);
      out.returns.push(...moved.returns);
      out.left = Math.min(out.left, moved.left);
      out.right = Math.max(out.right, moved.right);
      pending = moved.exits;
      y = top + block.height;
    }
    out.height = y;
    out.exits = pending;
    return out;
  }

  list(statements: Node[]): Block {
    return this.sequence(statements.map((statement) => this.statement(statement)));
  }

  body(statement: Node): Block {
    return statement.type === "BlockStatement" ? this.list(statement.body) : this.statement(statement);
  }

  statement(node: Node): Block {
    switch (node.type) {
      case "FunctionDeclaration":
      case "EmptyStatement":
        return emptyBlock();
      case "BlockStatement":
        return this.list(node.body);
      case "IfStatement":
        return this.ifBlock(node);
      case "WhileStatement":
      case "DoWhileStatement":
      case "ForStatement":
      case "ForOfStatement":
      case "ForInStatement":
        return this.loopBlock(node);
      case "BreakStatement":
      case "ContinueStatement":
      case "ReturnStatement": {
        const block = this.single(this.node("process", code(node), lineOf(node), [`stmt:${loc(node)}`]));
        const target = node.type === "BreakStatement" ? "breaks" : node.type === "ContinueStatement" ? "continues" : "returns";
        const node0 = block.nodes[0]!;
        const side = target === "continues" ? -node0.w / 2 : node0.w / 2;
        block[target] = [{ from: node0.id, kind: target === "continues" ? "loop" : "flow", points: [[side, node0.h / 2]] }];
        block.exits = [];
        return block;
      }
      default: {
        const isLog = node.type === "ExpressionStatement" && node.expression?.type === "CallExpression"
          && node.expression.callee?.object?.name === "console";
        return this.single(this.node(isLog ? "io" : "process", code(node), lineOf(node), [`stmt:${loc(node)}`]));
      }
    }
  }

  ifBlock(node: Node): Block {
    const keys = [`cond:${loc(node.test)}`, `branch:${loc(node.consequent)}`];
    if (node.alternate) keys.push(`branch:${loc(node.alternate)}`);
    const diamond = this.node("decision", code(node.test), lineOf(node), keys);
    const half = diamond.w / 2;
    const middle = diamond.h / 2;
    const top = diamond.h + GAP_Y;
    const consequent = this.body(node.consequent);
    const out: Block = { ...emptyBlock(), entry: diamond.id, nodes: [diamond], left: -half, right: half };
    const absorb = (block: Block) => {
      out.nodes.push(...block.nodes);
      out.edges.push(...block.edges);
      out.breaks.push(...block.breaks);
      out.continues.push(...block.continues);
      out.returns.push(...block.returns);
      out.left = Math.min(out.left, block.left);
      out.right = Math.max(out.right, block.right);
    };

    if (node.alternate) {
      const alternate = this.body(node.alternate);
      const cx = Math.min(-(GAP_X / 2 + consequent.right), -half);
      const ax = Math.max(GAP_X / 2 - alternate.left, half);
      const left = translate(consequent, cx, top);
      const right = translate(alternate, ax, top);
      out.height = top + Math.max(consequent.height, alternate.height);
      const branch = (block: Block, x: number, side: number, kind: FlowEdgeKind) => {
        const points: Point[] = [[side, middle], [x, middle]];
        if (block.entry) out.edges.push({ from: diamond.id, to: block.entry, kind, points: [...points, [x, top]], label: String(kind) });
        else out.exits.push({ from: diamond.id, kind, points: [...points, [x, out.height]], label: String(kind) });
      };
      branch(left, cx, -half, "true");
      branch(right, ax, half, "false");
      absorb(left);
      absorb(right);
      out.exits.push(...extend(left.exits, out.height), ...extend(right.exits, out.height));
      return out;
    }

    const below = translate(consequent, 0, top);
    absorb(below);
    out.height = top + consequent.height;
    const lane = Math.max(below.right, half) + LANE;
    if (below.entry) out.edges.push({ from: diamond.id, to: below.entry, kind: "true", points: [[0, diamond.h], [0, top]], label: "true" });
    out.exits.push(...extend(below.exits, out.height), { from: diamond.id, kind: "false", points: [[half, middle], [lane, middle], [lane, out.height]], label: "false" });
    out.right = Math.max(out.right, lane);
    return out;
  }

  loopBlock(node: Node): Block {
    const keys = [`loop:${loc(node.body)}`];
    let label: string;
    if (node.type === "ForOfStatement" || node.type === "ForInStatement") {
      const left = node.left.type === "VariableDeclaration" ? node.left.declarations[0].id : node.left;
      label = `${code(left)} ${node.type === "ForOfStatement" ? "of" : "in"} ${code(node.right)}`;
    } else {
      label = node.test ? code(node.test) : "true";
      if (node.test) keys.push(`cond:${loc(node.test)}`);
    }
    const diamond = this.node("decision", label, lineOf(node), keys);
    const half = diamond.w / 2;
    const middle = diamond.h / 2;
    const top = diamond.h + GAP_Y;
    const body = translate(this.body(node.body), 0, top);
    const bodyBottom = top + (body.entry ? body.height : 0);
    const backY = bodyBottom + LANE;
    const leftLane = Math.min(body.left, -half) - LANE;
    const rightLane = Math.max(body.right, half) + LANE;
    const height = backY + LANE / 2;
    const update = node.type === "ForStatement" && node.update ? code(node.update) : undefined;

    const out: Block = {
      ...emptyBlock(),
      entry: diamond.id,
      entryLabel: node.type === "ForStatement" && node.init ? code(node.init) : undefined,
      left: leftLane,
      right: rightLane,
      height,
      nodes: [diamond, ...body.nodes],
      edges: [...body.edges],
      returns: body.returns,
    };
    if (body.entry) out.edges.push({ from: diamond.id, to: body.entry, kind: "true", points: [[0, diamond.h], [0, top]], label: "true" });
    const toDiamond: Point[] = [[leftLane, middle], [-half, middle]];
    for (const [index, exit] of extend(body.exits, bodyBottom).entries()) {
      const last = exit.points.at(-1)!;
      out.edges.push({ from: exit.from, to: diamond.id, kind: "loop", points: [...exit.points, [last[0], backY], [leftLane, backY], ...toDiamond], label: index === 0 ? update : undefined });
    }
    for (const exit of body.continues) {
      const last = exit.points.at(-1)!;
      out.edges.push({ from: exit.from, to: diamond.id, kind: "loop", points: [...exit.points, [leftLane, last[1]], ...toDiamond] });
    }
    out.exits.push({ from: diamond.id, kind: "false", points: [[half, middle], [rightLane, middle], [rightLane, height]], label: "false" });
    for (const exit of body.breaks) {
      const last = exit.points.at(-1)!;
      out.exits.push({ ...exit, points: [...exit.points, [rightLane, last[1]], [rightLane, height]] });
    }
    return out;
  }

  /** A column with its own start and end terminals, used for the program and each function. */
  column(startLabel: string, endLabel: string, line: number, statements: Node[], startKeys: string[], endKeys: string[]): Block {
    const start = this.single(this.node("terminal", startLabel, line, startKeys));
    const body = this.list(statements);
    const endNode = this.node("terminal", endLabel, line, endKeys);
    const end = this.single(endNode);
    end.exits = [];
    const column = this.sequence([start, body, end]);
    const endTop = column.height - endNode.h;
    const lane = Math.max(column.right, endNode.w / 2) + LANE;
    for (const exit of column.returns) {
      const last = exit.points.at(-1)!;
      column.edges.push({ from: exit.from, to: endNode.id, kind: "flow", points: [...exit.points, [lane, last[1]], [lane, endTop + endNode.h / 2], [endNode.w / 2, endTop + endNode.h / 2]] });
    }
    if (column.returns.length) column.right = lane;
    return column;
  }
}

/** Rounded orthogonal path through the points. */
function pathData(points: Point[]) {
  const clean = points.filter((point, index) => index === 0 || point[0] !== points[index - 1]![0] || point[1] !== points[index - 1]![1]);
  if (clean.length < 2) return "";
  const radius = 10;
  let d = `M${clean[0]![0]} ${clean[0]![1]}`;
  for (let index = 1; index < clean.length; index++) {
    const [x, y] = clean[index]!;
    const next = clean[index + 1];
    if (!next) { d += ` L${x} ${y}`; break; }
    const [px, py] = clean[index - 1]!;
    const inLength = Math.hypot(x - px, y - py);
    const outLength = Math.hypot(next[0] - x, next[1] - y);
    const r = Math.min(radius, inLength / 2, outLength / 2);
    const ax = x - ((x - px) / inLength) * r;
    const ay = y - ((y - py) / inLength) * r;
    const bx = x + ((next[0] - x) / outLength) * r;
    const by = y + ((next[1] - y) / outLength) * r;
    d += ` L${ax} ${ay} Q${x} ${y} ${bx} ${by}`;
  }
  return d;
}

function labelPlacement(points: Point[], kind: FlowEdgeKind): Pick<FlowEdge, "labelAt" | "labelAnchor"> {
  const [first, second] = points;
  if (!first) return {};
  if (kind === "loop") {
    // Sit beside the vertical run of the back edge.
    const lane = points.at(-2) ?? first;
    const below = points.at(-3) ?? first;
    return { labelAt: [lane[0] - 6, (lane[1] + below[1]) / 2], labelAnchor: "end" };
  }
  if (second && second[1] === first[1]) return { labelAt: [(first[0] + second[0]) / 2, first[1] - 6], labelAnchor: "middle" };
  // Vertical edge: beside the line, halfway down.
  const end = points.at(-1)!;
  return { labelAt: [first[0] + 8, (first[1] + end[1]) / 2], labelAnchor: "start" };
}

export function buildFlow(source: string): FlowGraph {
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "script", locations: true }) as unknown as Node;
  const builder = new Builder();
  const programBody = ast.body.filter((node: Node) => node.type !== "FunctionDeclaration");
  const columns = [builder.column("start", "end", 1, programBody, ["start"], ["end"])];
  for (const fn of ast.body.filter((node: Node) => node.type === "FunctionDeclaration")) {
    const signature = `${fn.id.name}(${fn.params.map((parameter: Node) => parameter.name).join(", ")})`;
    columns.push(builder.column(signature, `return from ${fn.id.name}`, lineOf(fn), fn.body.body, [`call:${loc(fn)}`], [`ret:${loc(fn)}`]));
  }

  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  let x = MARGIN;
  let height = 0;
  for (const column of columns) {
    const placed = translate(column, x - column.left, MARGIN);
    nodes.push(...placed.nodes);
    for (const edge of placed.edges) {
      const label = edge.label ? { label: edge.label, ...labelPlacement(edge.points, edge.kind) } : {};
      edges.push({ id: `e${edges.length}`, from: edge.from, to: edge.to, kind: edge.kind, d: pathData(edge.points), ...label });
    }
    x += column.right - column.left + GAP_X * 2;
    height = Math.max(height, column.height);
  }
  return { width: x - GAP_X * 2 + MARGIN, height: height + MARGIN * 2, nodes, edges, lookup: builder.lookup };
}
