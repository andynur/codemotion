import { useEffect, useRef } from "react";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { EditorView, Decoration, keymap, type DecorationSet } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";

const setHighlightedLines = StateEffect.define<{ active?: number; error?: number }>();
const highlightedLines = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (!effect.is(setHighlightedLines)) continue;
      const ranges = [];
      for (const [line, className] of [[effect.value.active, "cm-active-trace-line"], [effect.value.error, "cm-error-line"]] as const) {
        if (line && line <= transaction.state.doc.lines) ranges.push(Decoration.line({ class: className }).range(transaction.state.doc.line(line).from));
      }
      return Decoration.set(ranges, true);
    }
    return value.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  activeLine?: number;
  errorLine?: number;
}

export function CodeEditor({ value, onChange, activeLine, errorLine }: CodeEditorProps) {
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
          highlightedLines,
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
    editor.dispatch({ effects: setHighlightedLines.of({ active: activeLine, error: errorLine }) });
    if (activeLine && activeLine <= editor.state.doc.lines) editor.dispatch({ effects: EditorView.scrollIntoView(editor.state.doc.line(activeLine).from, { y: "center" }) });
  }, [activeLine, errorLine]);

  return <div className="code-editor" ref={host} aria-label="JavaScript editor" />;
}
