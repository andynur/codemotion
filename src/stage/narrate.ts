import type { SnapshotValue, Step, Trace } from "../tracer/types";

export const display = (value: SnapshotValue) => {
  if (value === undefined) return "undefined";
  return typeof value === "string" ? `“${value}”` : JSON.stringify(value);
};

const short = (value: SnapshotValue) => {
  const text = display(value);
  return text.length > 24 ? `${text.slice(0, 23)}…` : text;
};

/** Variables visible at a step: globals plus the running frame's locals. */
export function visibleScope(step?: Step): Record<string, SnapshotValue> {
  if (!step) return {};
  return { ...step.scopes.global, ...(step.scopes.stack?.at(-1)?.locals ?? {}) };
}

/** Names whose value differs from the previous step in the same frame. */
export function changedNames(trace: Trace, index: number): string[] {
  const step = trace[index];
  const previous = trace[index - 1];
  if (!step || !previous) return [];
  const sameFrame = step.scopes.stack?.at(-1)?.id === previous.scopes.stack?.at(-1)?.id;
  const before = sameFrame ? visibleScope(previous) : previous.scopes.global;
  const after = visibleScope(step);
  return Object.keys(after).filter((name) => JSON.stringify(after[name]) !== JSON.stringify(before[name]));
}

export interface Narration {
  /** Short inline annotation shown at the end of the active code line. */
  note: string;
  /** Operation summary for the stage pill. */
  pill: string;
  /** Sentence describing the step. */
  caption: string;
  tone: "neutral" | "true" | "false" | "loop";
}

function iteration(trace: Trace, index: number) {
  const step = trace[index]!;
  let count = 0;
  for (let cursor = index; cursor >= 0; cursor--) {
    const item = trace[cursor]!;
    if (item.kind === "loop" && item.line === step.line && item.col === step.col) count++;
    // A false check of this loop marks the end of an earlier run of it, e.g. an inner loop.
    if (item.kind === "program" || (item.kind === "condition" && item.line === step.line && item.event.detail === false)) break;
  }
  return count;
}

type Lang = "en" | "id";

/** Explains a trace step. `label` is the flowchart text for the step's node, when known. */
export function narrate(trace: Trace, index: number, label?: string, lang: Lang = "en"): Narration {
  const step = trace[index];
  if (!step) return { note: "", pill: "", caption: "", tone: "neutral" };
  const id = lang === "id";
  const previous = trace[index - 1];
  const scope = visibleScope(step);
  const changed = changedNames(trace, index);
  const change = changed.map((name) => {
    const before = previous ? visibleScope(previous)[name] : undefined;
    return before === undefined ? `${name} = ${short(scope[name])}` : `${name}: ${short(before)} → ${short(scope[name])}`;
  }).join(", ");
  const code = label ?? `${id ? "baris" : "line"} ${step.line}`;

  switch (step.kind) {
    case "program":
      if (step.event.detail === "end") return { note: "", pill: id ? "selesai" : "done", caption: id ? `Program selesai setelah ${trace.length} langkah.` : `Program finished after ${trace.length} steps.`, tone: "neutral" };
      return { note: "", pill: id ? "mulai" : "start", caption: id ? "Program dimulai. Memori masih kosong." : "Program starts. Nothing is in memory yet.", tone: "neutral" };
    case "condition": {
      const result = Boolean(step.event.detail);
      const caption = id
        ? `Cek ${code}: hasilnya ${result}, jadi ambil jalur ${result ? "true" : "false"}.`
        : `Check ${code}: it is ${result}, so ${result ? "take the true path" : "take the false path"}.`;
      return { note: `// ${code} → ${result}`, pill: `${code} → ${result}`, caption, tone: result ? "true" : "false" };
    }
    case "loop": {
      const count = iteration(trace, index);
      const kind = step.event.detail ?? "";
      const caption = id
        ? `Mulai iterasi ${count} dari loop ${kind}${change ? ` dengan ${change}` : ""}.`
        : `Start iteration ${count} of the ${kind} loop${change ? ` with ${change}` : ""}.`;
      return { note: `// ${id ? "iterasi" : "iteration"} ${count}`, pill: `${step.event.detail ?? "loop"} #${count}`, caption, tone: "loop" };
    }
    case "branch":
      return { note: `// ${id ? "masuk" : "take"} ${step.event.detail}`, pill: `branch ${step.event.detail}`, caption: id ? `Masuk ke cabang ${step.event.detail}.` : `Enter the ${step.event.detail} branch.`, tone: step.event.detail === "else" ? "false" : "true" };
    case "call": {
      const frame = step.scopes.stack?.at(-1);
      const args = frame ? Object.entries(frame.locals).map(([name, value]) => `${name}=${short(value)}`).join(", ") : "";
      const caption = id
        ? `Panggil ${step.event.detail}(${args}). Frame baru masuk ke call stack.`
        : `Call ${step.event.detail}(${args}). A new frame goes on the call stack.`;
      return { note: `// call ${step.event.detail}(${args})`, pill: `call ${step.event.detail}()`, caption, tone: "neutral" };
    }
    case "return": {
      const value = short(step.event.returnValue);
      const caption = id
        ? `${step.event.detail ?? "Fungsi"} mengembalikan ${value} dan frame-nya keluar dari stack.`
        : `${step.event.detail ?? "The function"} returns ${value} and its frame leaves the stack.`;
      return { note: `// return ${value}`, pill: `return ${value}`, caption, tone: "neutral" };
    }
    case "console":
      if (step.event.output !== undefined) return { note: `// ${id ? "cetak" : "prints"} ${step.event.output}`, pill: "console.log", caption: id ? `Cetak “${step.event.output}” ke konsol.` : `Print “${step.event.output}” to the console.`, tone: "neutral" };
      return { note: "", pill: "console.log", caption: id ? "Output ditulis." : "Output written.", tone: "neutral" };
    case "control": {
      const caption = step.event.detail === "break"
        ? id ? "Keluar dari loop." : "Break out of the loop."
        : id ? "Lompat ke iterasi berikutnya." : "Skip to the next iteration.";
      return { note: `// ${step.event.detail}`, pill: String(step.event.detail), caption, tone: "loop" };
    }
    case "array-mutation": {
      const how = step.event.detail === "index assignment"
        ? id ? " di satu indeks" : " at an index"
        : id ? ` dengan ${step.event.detail}()` : ` with ${step.event.detail}()`;
      return { note: change ? `// ${change}` : `// ${step.event.detail}`, pill: String(step.event.detail ?? "array"), caption: `${id ? "Ubah array" : "Update the array"}${how}${change ? `: ${change}` : ""}.`, tone: "neutral" };
    }
    case "declaration": {
      const caption = change
        ? `${id ? "Deklarasi" : "Declare"} ${change}.`
        : `${id ? "Deklarasi" : "Declare"} ${step.event.detail ?? (id ? "variabel" : "a variable")}.`;
      return { note: change ? `// ${change}` : "", pill: `declare ${step.event.detail ?? ""}`.trim(), caption, tone: "neutral" };
    }
    default: {
      const caption = change ? `${id ? "Isi" : "Assign"} ${change}.` : `${id ? "Jalankan" : "Run"} ${code}.`;
      return { note: change ? `// ${change}` : "", pill: step.kind, caption, tone: "neutral" };
    }
  }
}
