import { useEffect, useRef } from "react";
import { EditorSelection, EditorState, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { EditorView, Decoration, RectangleMarker, ViewPlugin, WidgetType, keymap, layer, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { syntaxTree } from "@codemirror/language";

interface TraceMarks { active?: number; error?: number; note?: string }

class GhostWidget extends WidgetType {
  constructor(readonly text: string) { super(); }
  override eq(other: GhostWidget) { return other.text === this.text; }
  toDOM() {
    const element = document.createElement("span");
    element.className = "cm-ghost";
    element.textContent = this.text;
    return element;
  }
}

const setTraceMarks = StateEffect.define<TraceMarks>();
const traceMarks = StateField.define<{ marks: TraceMarks; decorations: DecorationSet }>({
  create: () => ({ marks: {}, decorations: Decoration.none }),
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (!effect.is(setTraceMarks)) continue;
      const { doc } = transaction.state;
      const marks = effect.value;
      const ranges = [];
      for (const [line, className] of [[marks.active, "cm-active-trace-line"], [marks.error, "cm-error-line"]] as const) {
        if (line && line <= doc.lines) ranges.push(Decoration.line({ class: className }).range(doc.line(line).from));
      }
      if (marks.active && marks.note && marks.active <= doc.lines) {
        ranges.push(Decoration.widget({ widget: new GhostWidget(marks.note), side: 1 }).range(doc.line(marks.active).to));
      }
      return { marks, decorations: Decoration.set(ranges, true) };
    }
    return { marks: value.marks, decorations: value.decorations.map(transaction.changes) };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

/** A bar behind the active line that springs between lines instead of jumping. */
const traceBar = layer({
  above: false,
  class: "cm-trace-layer",
  markers(view) {
    const line = view.state.field(traceMarks).marks.active;
    if (!line || line > view.state.doc.lines) return [];
    const { from, to } = view.state.doc.line(line);
    const rects = RectangleMarker.forRange(view, "cm-trace-bar", EditorSelection.range(from, Math.max(from, to)));
    const first = rects[0];
    const coords = view.coordsAtPos(from);
    if (!first || !coords) return [];
    // Text rects are shorter than the line box; shift up to the line block's top and use its full height.
    const block = view.lineBlockAt(from);
    const textOffset = coords.top - (view.documentTop + block.top);
    return [new RectangleMarker("cm-trace-bar", 0, first.top - textOffset, view.contentDOM.offsetWidth, block.height)];
  },
  update: (update: ViewUpdate) => update.docChanged || update.geometryChanged || update.transactions.some((transaction) => transaction.effects.some((effect) => effect.is(setTraceMarks))),
});

// Syntax colors from lezer node names, so the theme stays on design tokens without extra packages.
const tokenClasses: Record<string, string> = {
  Number: "tok-number", String: "tok-string", TemplateString: "tok-string", BooleanLiteral: "tok-number", null: "tok-number",
  LineComment: "tok-comment", BlockComment: "tok-comment",
  VariableDefinition: "tok-definition", PropertyName: "tok-property",
  ArithOp: "tok-operator", CompareOp: "tok-operator", LogicOp: "tok-operator", UpdateOp: "tok-operator", Equals: "tok-operator",
};
for (const keyword of ["let", "const", "var", "for", "while", "do", "if", "else", "return", "function", "break", "continue", "of", "in", "new", "typeof", "switch", "case", "default"]) tokenClasses[keyword] = "tok-keyword";

function highlight(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from, to,
      enter: (node) => {
        const className = tokenClasses[node.name];
        if (className) builder.add(node.from, node.to, Decoration.mark({ class: className }));
      },
    });
  }
  return builder.finish();
}

const syntaxColors = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = highlight(view); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) this.decorations = highlight(update.view);
  }
}, { decorations: (plugin) => plugin.decorations });

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  activeLine?: number;
  errorLine?: number;
  note?: string;
  label?: string;
}

export function CodeEditor({ value, onChange, activeLine, errorLine, note, label = "JavaScript editor" }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const changeHandler = useRef(onChange);
  changeHandler.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const next = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
          javascript(),
          syntaxColors,
          traceMarks,
          traceBar,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) changeHandler.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = next;
    return () => { next.destroy(); view.current = null; };
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    editor.dispatch({ effects: setTraceMarks.of({ active: activeLine, error: errorLine, note }) });
    if (activeLine && activeLine <= editor.state.doc.lines) editor.dispatch({ effects: EditorView.scrollIntoView(editor.state.doc.line(activeLine).from, { y: "nearest", yMargin: 48 }) });
  }, [activeLine, errorLine, note]);

  return <div className="code-editor" ref={host} aria-label={label} />;
}
