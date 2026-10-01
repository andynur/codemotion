import { useCallback, useEffect, useMemo, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { CodeEditor } from "../editor/CodeEditor";
import { usePlayback } from "../playback/usePlayback";
import { defaultPreset, presets } from "../presets";
import { Stage } from "../stage/Stage";
import { runCode } from "../tracer/run";
import { isTraceError, type Trace, type TraceError } from "../tracer/types";
import "./app.css";

const styles = { app: "app", brand: "brand", controls: "controls", editorPanel: "editorPanel", errorMessage: "errorMessage", language: "language", panel: "panel", panelGroup: "panelGroup", panelHeader: "panelHeader", playButton: "playButton", presetLabel: "presetLabel", primaryButton: "primaryButton", resizeHandle: "resizeHandle", speed: "speed", stagePanel: "stagePanel", status: "status", subtleButton: "subtleButton", tabActive: "tabActive", timeline: "timeline", topbar: "topbar", transport: "transport", workspace: "workspace" } as const;

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

export function App() {
  const initialSource = useMemo(() => decodeSource(location.hash.slice(1)) ?? defaultPreset.source, []);
  const [source, setSource] = useState(initialSource);
  const [trace, setTrace] = useState<Trace>([]);
  const [error, setError] = useState<TraceError>();
  const [running, setRunning] = useState(false);
  const playback = usePlayback(trace.length);
  const step = trace[playback.current];

  const run = useCallback(async () => {
    setRunning(true);
    setError(undefined);
    playback.reset();
    const result = await runCode(source);
    if (isTraceError(result)) { setError(result); setTrace(result.trace ?? []); }
    else setTrace(result);
    setRunning(false);
  }, [source]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const editorFocused = (event.target as HTMLElement)?.closest?.(".cm-editor");
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void run(); }
      else if (!editorFocused && event.key === "ArrowLeft") { event.preventDefault(); playback.back(); }
      else if (!editorFocused && event.key === "ArrowRight") { event.preventDefault(); playback.forward(); }
      else if (!editorFocused && event.code === "Space") { event.preventDefault(); playback.toggle(); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [run, playback.back, playback.forward, playback.toggle]);

  const selectPreset = (id: string) => {
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    setSource(preset.source); setTrace([]); setError(undefined); playback.reset();
  };
  const share = async () => {
    const url = `${location.origin}${location.pathname}#${encodeSource(source)}`;
    history.replaceState(null, "", url);
    await navigator.clipboard?.writeText(url);
  };

  return (
    <div className={styles.app}>
      <header className={styles.topbar}>
        <a className={styles.brand} href="/" aria-label="Code Motion home"><span>CM</span><div><strong>Code Motion</strong><small>Visualizer</small></div></a>
        <label className={styles.presetLabel}>Example<select data-testid="preset-picker" value={presets.find((preset) => preset.source === source)?.id ?? "custom"} onChange={(event) => selectPreset(event.target.value)}><option value="custom" disabled>Custom code</option>{presets.map((preset) => <option value={preset.id} key={preset.id}>{preset.name}</option>)}</select></label>
        <button className={styles.subtleButton} onClick={() => void share()} title="Copy a shareable URL">Share</button>
        <button id="run-button" className={styles.primaryButton} onClick={() => void run()} disabled={running}>{running ? "Tracing…" : "Run code"}<kbd>⌘↵</kbd></button>
      </header>

      <main className={styles.workspace}>
        <Group orientation="horizontal" className={styles.panelGroup}>
          <Panel defaultSize="46" minSize="30" className={styles.panel}>
            <section className={styles.editorPanel}>
              <header className={styles.panelHeader}><div><span className={styles.tabActive}>Code</span></div><span className={styles.language}>JavaScript</span></header>
              <CodeEditor value={source} onChange={(value) => { setSource(value); setTrace([]); setError(undefined); }} activeLine={step?.line} errorLine={error?.line} />
              {error && <div className={styles.errorMessage} role="alert"><strong>{error.code === "STEP_LIMIT" ? "Step limit reached" : "Could not trace this code"}</strong><span>{error.message}{error.line ? ` (line ${error.line})` : ""}</span></div>}
            </section>
          </Panel>
          <Separator className={styles.resizeHandle}><span /></Separator>
          <Panel defaultSize="54" minSize="30" className={styles.panel}>
            <section className={styles.stagePanel}><header className={styles.panelHeader}><div><span className={styles.tabActive}>Visualization</span></div><span data-testid="trace-status" className={styles.status}>{trace.length ? `${trace.length} steps` : "Not run"}</span></header><Stage step={step} trace={trace} /></section>
          </Panel>
        </Group>
      </main>

      <footer className={styles.controls}>
        <div className={styles.transport}><button onClick={playback.back} disabled={!trace.length || playback.current === 0} aria-label="Step back">←</button><button className={styles.playButton} onClick={playback.toggle} disabled={!trace.length} aria-label={playback.playing ? "Pause" : "Play"}>{playback.playing ? "Ⅱ" : "▶"}</button><button onClick={playback.forward} disabled={!trace.length || playback.current >= trace.length - 1} aria-label="Step forward">→</button></div>
        <label className={styles.timeline}><span data-testid="current-step">{trace.length ? playback.current + 1 : 0}</span><input id="timeline" type="range" min="0" max={Math.max(0, trace.length - 1)} value={playback.current} onChange={(event) => playback.setCurrent(Number(event.target.value))} disabled={!trace.length} aria-label="Timeline" /><span>{trace.length}</span></label>
        <label className={styles.speed}>Speed<select value={playback.speed} onChange={(event) => playback.setSpeed(Number(event.target.value))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
      </footer>
    </div>
  );
}
