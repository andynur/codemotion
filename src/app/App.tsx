import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { CodeEditor } from "../editor/CodeEditor";
import { usePlayback } from "../playback/usePlayback";
import { defaultPreset, presets } from "../presets";
import { tracePath } from "../stage/flowModel";
import { narrate } from "../stage/narrate";
import { FlowStage, MemoryPanel, StatePanel } from "../stage/Stage";
import { runCode } from "../tracer/run";
import { isTraceError, type FlowGraph, type Trace, type TraceError } from "../tracer/types";
import { LangContext, dictionaries, useLang } from "./i18n";
import { useTheme } from "./useTheme";
import "./app.css";

function encodeSource(source: string) {
  const bytes = new TextEncoder().encode(source);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeSource(hash: string) {
  if (!hash) return null;
  try {
    const normalized = hash.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  } catch { return null; }
}

const compactQuery = "(max-width: 48rem)";

/** Narrow screens stack the cards; resizable panes need room to be useful. */
function useCompact() {
  const [compact, setCompact] = useState(() => matchMedia(compactQuery).matches);
  useEffect(() => {
    const query = matchMedia(compactQuery);
    const change = () => setCompact(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return compact;
}

interface LayoutProps { children?: ReactNode; className?: string; [prop: string]: unknown }
const Stack = ({ children }: LayoutProps) => <div className="stack">{children}</div>;
const StackItem = ({ children }: LayoutProps) => <div className="stackItem">{children}</div>;
const NoHandle = (_: LayoutProps) => null;

const typingTarget = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest(".cm-editor, input, select, textarea"));

export function App() {
  const initialSource = useMemo(() => decodeSource(location.hash.slice(1)) ?? defaultPreset.source, []);
  const [source, setSource] = useState(initialSource);
  const [trace, setTrace] = useState<Trace>([]);
  const [flow, setFlow] = useState<FlowGraph>();
  const [error, setError] = useState<TraceError>();
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang, toggleLang } = useLang();
  const t = dictionaries[lang];
  const compact = useCompact();
  const Split = (compact ? Stack : Group) as typeof Stack;
  const Pane = (compact ? StackItem : Panel) as typeof StackItem;
  const Handle = (compact ? NoHandle : Separator) as typeof NoHandle;
  const playback = usePlayback(trace.length);
  const index = playback.current;
  const step = trace[index];
  const path = useMemo(() => flow && trace.length ? tracePath(trace, flow) : undefined, [flow, trace]);
  const note = useMemo(() => {
    if (!step) return undefined;
    const label = step.kind === "condition" ? flow?.nodes.find((node) => node.id === path?.nodes[index])?.label : undefined;
    return narrate(trace, index, label, lang).note || undefined;
  }, [trace, index, step, flow, path, lang]);

  const run = useCallback(async (code = source) => {
    setRunning(true);
    setError(undefined);
    playback.reset();
    const { result, flow: graph } = await runCode(code);
    if (isTraceError(result)) { setError(result); setTrace(result.trace ?? []); }
    else setTrace(result);
    setFlow(graph);
    setRunning(false);
  }, [source]);

  // Show the default program in motion right away.
  useEffect(() => { void run(initialSource); }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void run(); return; }
      if (typingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      // A focused button already handles Space natively.
      if (event.code === "Space" && event.target instanceof Element && event.target.closest("button")) return;
      const actions: Record<string, () => void> = {
        ArrowLeft: () => { playback.pause(); playback.back(); },
        ArrowRight: () => { playback.pause(); playback.forward(); },
        Home: () => { playback.pause(); playback.first(); },
        End: () => { playback.pause(); playback.last(); },
        " ": playback.toggle,
        t: toggleTheme,
        T: toggleTheme,
        l: toggleLang,
        L: toggleLang,
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [run, playback.back, playback.forward, playback.toggle, playback.first, playback.last, playback.pause, toggleTheme, toggleLang]);

  const editSource = (value: string) => { setSource(value); setTrace([]); setFlow(undefined); setError(undefined); };
  const selectPreset = (id: string) => {
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    editSource(preset.source);
    void run(preset.source);
  };
  const share = async () => {
    const url = `${location.origin}${location.pathname}#${encodeSource(source)}`;
    history.replaceState(null, "", url);
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };
  const atStart = !trace.length || index === 0;
  const atEnd = !trace.length || index >= trace.length - 1;

  const presetId = presets.find((preset) => preset.source === source)?.id ?? "custom";
  const lineCount = source.split("\n").length;

  return (
    <LangContext.Provider value={lang}>
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" aria-label={t.home}><span>CM</span><div><strong>Code Motion</strong><small>{t.brandTagline}</small></div></a>

        <section className="player" aria-label={t.player}>
          <div className="transport">
            <button onClick={playback.first} disabled={atStart} aria-label={t.first} title={`${t.first} (Home)`}>⏮</button>
            <button data-testid="step-back" onClick={() => { playback.pause(); playback.back(); }} disabled={atStart} aria-label={t.back} title={`${t.back} (←)`}>←</button>
            <button data-testid="play-toggle" className="playButton" onClick={playback.toggle} disabled={!trace.length} aria-label={playback.playing ? t.pause : t.play} title={t.playTitle}>{playback.playing ? "❚❚" : atEnd && trace.length > 1 ? "↺" : "▶"}</button>
            <button data-testid="step-forward" onClick={() => { playback.pause(); playback.forward(); }} disabled={atEnd} aria-label={t.forward} title={`${t.forward} (→)`}>→</button>
            <button onClick={playback.last} disabled={atEnd} aria-label={t.last} title={`${t.last} (End)`}>⏭</button>
          </div>
          <label className="timeline">
            <span data-testid="current-step">{trace.length ? index + 1 : 0}</span>
            <input id="timeline" type="range" min="0" max={Math.max(0, trace.length - 1)} value={index} onChange={(event) => { playback.pause(); playback.setCurrent(Number(event.target.value)); }} disabled={!trace.length} aria-label={t.timeline} style={{ "--progress": `${trace.length > 1 ? (index / (trace.length - 1)) * 100 : 0}%` } as CSSProperties} />
            <span>{trace.length}</span>
          </label>
          <select className="speed" value={playback.speed} onChange={(event) => playback.setSpeed(Number(event.target.value))} aria-label={t.speed} title={t.speed}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select>
        </section>

        <div className="topActions">
          <div className="langToggle" role="group" aria-label={t.langTitle} title={t.langTitle}>
            {(["id", "en"] as const).map((value) => <button key={value} aria-pressed={lang === value} onClick={() => setLang(value)}>{value.toUpperCase()}</button>)}
          </div>
          <button className="iconButton" onClick={toggleTheme} aria-label={t.switchTheme(theme === "dark" ? "light" : "dark")} title={t.themeTitle}>{theme === "dark" ? "☀" : "☾"}</button>
          <button id="run-button" className="primaryButton" onClick={() => void run()} disabled={running}>{running ? t.tracing : t.run}<kbd>⌘↵</kbd></button>
        </div>
      </header>

      <main className="workspace">
        <Split orientation="horizontal" className="panelGroup">
          <Pane defaultSize="42" minSize="28" className="panel">
            <Split orientation="vertical" className="columnGroup">
              <Pane defaultSize="64" minSize="25" className="panel">
                <section className="card">
                  <header className="cardHeader">
                    <span className="cardTitle">{t.code}</span>
                    <select className="presetPicker" data-testid="preset-picker" aria-label={t.example} title={t.example} value={presetId} onChange={(event) => selectPreset(event.target.value)}>
                      <option value="custom" disabled>{t.customCode}</option>
                      {presets.map((preset) => <option value={preset.id} key={preset.id}>{lang === "id" ? preset.nameId : preset.name}</option>)}
                    </select>
                  </header>
                  <CodeEditor value={source} onChange={editSource} activeLine={step?.line} errorLine={error?.line} note={note} label={t.editorLabel} />
                  {error && <div className="errorMessage" role="alert"><strong>{error.code === "STEP_LIMIT" ? t.stepLimit : t.traceFailed}</strong><span>{error.message}{error.line ? ` (${t.line.toLowerCase()} ${error.line})` : ""}</span></div>}
                  <footer className="cardFooter">
                    <span className={step ? "lineStatus active" : "lineStatus"}>{step ? `${t.line} ${step.line}` : `${lineCount} ${t.lines}`}</span>
                    <span>JavaScript</span>
                    <span className="runHint"><kbd>⌘↵</kbd> {t.runHint}</span>
                  </footer>
                </section>
              </Pane>
              <Handle className="resizeHandle horizontal"><span /></Handle>
              <Pane defaultSize="36" minSize="18" className="panel">
                <section className="card"><StatePanel trace={trace} index={index} /></section>
              </Pane>
            </Split>
          </Pane>
          <Handle className="resizeHandle"><span /></Handle>
          <Pane defaultSize="58" minSize="30" className="panel">
            <Split orientation="vertical" className="columnGroup">
              <Pane defaultSize="68" minSize="30" className="panel">
                <section className="card">
                  <header className="cardHeader">
                    <span className="cardTitle">{t.flow}</span>
                    <div className="cardTools">
                      <span data-testid="trace-status" className="cardMeta">{trace.length ? t.steps(trace.length) : running ? t.tracing : t.notRun}</span>
                      <button className="subtleButton small" onClick={() => void share()} title={t.shareTitle}>{copied ? `✓ ${t.linkCopied}` : `↗ ${t.share}`}</button>
                    </div>
                  </header>
                  <FlowStage trace={trace} index={index} flow={flow} path={path} playing={playback.playing} />
                </section>
              </Pane>
              <Handle className="resizeHandle horizontal"><span /></Handle>
              <Pane defaultSize="32" minSize="15" className="panel">
                <section className="card">
                  <header className="cardHeader"><span className="cardTitle">{t.memory}</span><span className="cardMeta">{t.memoryMeta}</span></header>
                  <MemoryPanel trace={trace} index={index} />
                </section>
              </Pane>
            </Split>
          </Pane>
        </Split>
      </main>
    </div>
    </LangContext.Provider>
  );
}
