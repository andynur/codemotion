import { parse } from "acorn";
import { fullAncestor } from "acorn-walk";
import { generate } from "astring";
import type { EventKind } from "./types";

type Node = Record<string, any> & { type: string; loc?: { start: { line: number; column: number } } };

export class UnsupportedSyntaxError extends Error {
  constructor(message: string, readonly line?: number) {
    super(message);
    this.name = "UnsupportedSyntaxError";
  }
}

const id = (name: string): Node => ({ type: "Identifier", name });
const literal = (value: unknown): Node => ({ type: "Literal", value });
const call = (name: string, args: Node[]): Node => ({ type: "CallExpression", callee: id(name), arguments: args });
const expressionStatement = (expression: Node): Node => ({ type: "ExpressionStatement", expression });

function meta(node: Node, kind: EventKind, detail?: string): Node {
  const properties = [
    { type: "Property", key: id("line"), value: literal(node.loc?.start.line ?? 1), kind: "init" },
    { type: "Property", key: id("col"), value: literal(node.loc?.start.column ?? 0), kind: "init" },
    { type: "Property", key: id("kind"), value: literal(kind), kind: "init" },
  ];
  if (detail) properties.push({ type: "Property", key: id("detail"), value: literal(detail), kind: "init" });
  return { type: "ObjectExpression", properties };
}

function capture(names: string[]): Node {
  return {
    type: "ArrowFunctionExpression",
    expression: true,
    params: [],
    body: {
      type: "ObjectExpression",
      properties: names.map((name) => ({
        type: "Property",
        key: literal(name),
        computed: false,
        kind: "init",
        method: false,
        shorthand: false,
        value: {
          type: "CallExpression",
          callee: id("__value"),
          arguments: [{ type: "ArrowFunctionExpression", expression: true, params: [], body: id(name) }],
        },
      })),
    },
  };
}

function traceStatement(node: Node, names: string[], kind: EventKind, detail?: string): Node {
  return expressionStatement(call("__trace", [meta(node, kind, detail), capture(names)]));
}

function wrapTest(node: Node, names: string[]): Node {
  return {
    type: "CallExpression",
    callee: id("__traceTest"),
    arguments: [node, meta(node, "condition"), capture(names)],
  };
}

function bindingNames(pattern: Node, names: Set<string>) {
  if (pattern.type === "Identifier") names.add(pattern.name);
  else if (pattern.type === "ArrayPattern") pattern.elements.filter(Boolean).forEach((item: Node) => bindingNames(item, names));
  else if (pattern.type === "ObjectPattern") pattern.properties.forEach((item: Node) => bindingNames(item.value ?? item.argument, names));
  else if (pattern.type === "RestElement" || pattern.type === "AssignmentPattern") bindingNames(pattern.argument ?? pattern.left, names);
}

interface FunctionScope { name: string; locals: string[] }
interface ProgramScopes { globals: string[]; functions: Map<Node, FunctionScope> }

function validateAndCollect(ast: Node): ProgramScopes {
  const globals = new Set<string>();
  const localSets = new Map<Node, Set<string>>();
  const topLevelFunctions = new Set<Node>(ast.body.filter((node: Node) => node.type === "FunctionDeclaration"));

  for (const fn of topLevelFunctions) {
    if (!fn.id?.name) throw new UnsupportedSyntaxError("Functions must have a name", fn.loc?.start.line);
    if (fn.async || fn.generator) throw new UnsupportedSyntaxError("Async functions and generators are not supported yet", fn.loc?.start.line);
    if (fn.params.some((parameter: Node) => parameter.type !== "Identifier")) {
      throw new UnsupportedSyntaxError("Function parameters must be simple names", fn.loc?.start.line);
    }
    localSets.set(fn, new Set(fn.params.map((parameter: Node) => parameter.name)));
  }

  fullAncestor(ast as never, (raw, _state, ancestors) => {
    const node = raw as Node;
    const containingFunctions = (ancestors as unknown as Node[]).filter((ancestor) => ancestor.type === "FunctionDeclaration");
    const owner = containingFunctions.at(-1);

    if (node.type === "VariableDeclarator") bindingNames(node.id, owner ? localSets.get(owner)! : globals);
    const unsupported: Record<string, string> = {
      FunctionExpression: "Functions and closures are not supported yet",
      ArrowFunctionExpression: "Arrow functions and closures are not supported yet",
      ClassDeclaration: "Classes are not supported yet",
      ClassExpression: "Classes are not supported yet",
      AwaitExpression: "async/await is not supported yet",
      YieldExpression: "Generators are not supported yet",
      TryStatement: "try/catch is not supported yet",
      ImportDeclaration: "Imports are not supported in visualized code",
      ExportNamedDeclaration: "Exports are not supported in visualized code",
      ExportDefaultDeclaration: "Exports are not supported in visualized code",
      NewExpression: "Constructors are not supported yet",
    };
    if (unsupported[node.type]) throw new UnsupportedSyntaxError(unsupported[node.type]!, node.loc?.start.line);
    if (node.type === "FunctionDeclaration" && !topLevelFunctions.has(node)) {
      throw new UnsupportedSyntaxError("Nested functions and closures are not supported yet", node.loc?.start.line);
    }
    if (node.type === "ObjectExpression") {
      const nested = node.properties.some((property: Node) => property.computed || property.kind !== "init" || ["ObjectExpression", "ArrayExpression"].includes(property.value?.type));
      if (nested) throw new UnsupportedSyntaxError("Only flat object literals are supported", node.loc?.start.line);
    }
  });

  const functions = new Map<Node, FunctionScope>();
  for (const fn of topLevelFunctions) functions.set(fn, { name: fn.id.name, locals: [...localSets.get(fn)!] });
  return { globals: [...globals], functions };
}

function expressionKind(node: Node): { kind: EventKind; detail?: string } | null {
  const expression = node.expression;
  if (["AssignmentExpression", "UpdateExpression"].includes(expression.type)) {
    const array = expression.left?.type === "MemberExpression";
    return { kind: array ? "array-mutation" : "assignment", detail: array ? "index assignment" : undefined };
  }
  if (expression.type === "CallExpression" && expression.callee?.type === "MemberExpression") {
    const method = expression.callee.property?.name;
    if (["push", "pop", "shift", "unshift", "splice"].includes(method)) return { kind: "array-mutation", detail: method };
    if (expression.callee.object?.name === "console" && method === "log") return { kind: "console", detail: "console.log" };
  }
  return null;
}

function asBlock(statement: Node, names: string[], scopes: ProgramScopes, functionName?: string, first?: Node): Node {
  const block = statement.type === "BlockStatement" ? statement : { type: "BlockStatement", body: [statement] };
  block.body = instrumentList(block.body, names, scopes, functionName);
  if (first) block.body.unshift(first);
  return block;
}

function instrumentFunction(node: Node, scopes: ProgramScopes) {
  const scope = scopes.functions.get(node)!;
  const names = [...new Set([...scopes.globals, ...scope.locals])];
  node.body.body = instrumentList(node.body.body, names, scopes, scope.name);
  node.body.body.unshift(expressionStatement(call("__enter", [
    meta(node, "call", scope.name),
    literal(scope.name),
    { type: "ArrayExpression", elements: scope.locals.map(literal) },
    capture(names),
  ])));
  node.body.body.push(expressionStatement(call("__return", [id("undefined"), meta(node, "return", scope.name), capture(names)])));
}

function instrumentNode(node: Node, names: string[], scopes: ProgramScopes, functionName?: string) {
  if (node.type === "FunctionDeclaration") instrumentFunction(node, scopes);
  if (node.type === "ReturnStatement") {
    node.argument = call("__return", [node.argument ?? id("undefined"), meta(node, "return", functionName), capture(names)]);
  }
  if (node.type === "BlockStatement") node.body = instrumentList(node.body, names, scopes, functionName);
  if (node.type === "IfStatement") {
    node.test = wrapTest(node.test, names);
    node.consequent = asBlock(node.consequent, names, scopes, functionName, traceStatement(node.consequent, names, "branch", "if"));
    if (node.alternate) node.alternate = asBlock(node.alternate, names, scopes, functionName, traceStatement(node.alternate, names, "branch", "else"));
  }
  if (["WhileStatement", "DoWhileStatement"].includes(node.type)) {
    node.test = wrapTest(node.test, names);
    node.body = asBlock(node.body, names, scopes, functionName, traceStatement(node.body, names, "loop", node.type === "WhileStatement" ? "while" : "do while"));
  }
  if (node.type === "ForStatement") {
    if (node.test) node.test = wrapTest(node.test, names);
    node.body = asBlock(node.body, names, scopes, functionName, traceStatement(node.body, names, "loop", "for"));
  }
  if (["ForOfStatement", "ForInStatement"].includes(node.type)) {
    node.body = asBlock(node.body, names, scopes, functionName, traceStatement(node.body, names, "loop", node.type === "ForOfStatement" ? "for of" : "for in"));
  }
}

function instrumentList(statements: Node[], names: string[], scopes: ProgramScopes, functionName?: string): Node[] {
  const output: Node[] = [];
  for (const statement of statements) {
    instrumentNode(statement, names, scopes, functionName);
    if (["BreakStatement", "ContinueStatement"].includes(statement.type)) {
      output.push(traceStatement(statement, names, "control", statement.type === "BreakStatement" ? "break" : "continue"));
    }
    output.push(statement);
    if (statement.type === "VariableDeclaration") output.push(traceStatement(statement, names, "declaration", statement.declarations.map((item: Node) => item.id.name).filter(Boolean).join(", ")));
    const expression = statement.type === "ExpressionStatement" ? expressionKind(statement) : null;
    if (expression) output.push(traceStatement(statement, names, expression.kind, expression.detail));
  }
  return output;
}

export interface InstrumentedProgram { code: string; variables: string[] }

export function instrument(source: string): InstrumentedProgram {
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "script", locations: true }) as unknown as Node;
  const scopes = validateAndCollect(ast);
  ast.body = instrumentList(ast.body, scopes.globals, scopes);
  ast.body.unshift(traceStatement(ast, scopes.globals, "program", "start"));
  ast.body.push(traceStatement(ast, scopes.globals, "program", "end"));
  return { code: generate(ast as never), variables: scopes.globals };
}
