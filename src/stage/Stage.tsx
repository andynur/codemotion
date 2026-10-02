import { AnimatePresence, motion } from "motion/react";
import type { CallFrame, FlowGraph, SnapshotValue, Trace } from "../tracer/types";
import { useT } from "../app/i18n";
import { FlowChart } from "./FlowChart";
import type { FlowPath } from "./flowModel";
import { stageTransition } from "./motion";
import { changedNames, display, narrate, visibleScope } from "./narrate";
import "./stage.css";

export function VarBox({ name, value, changed, stamp }: { name: string; value: SnapshotValue; changed: boolean; stamp: number }) {
  return (
    <motion.article layout className={`varBox${changed ? " changed" : ""}`} transition={stageTransition()}>
      <span className="varName">{name}</span>
      <code key={changed ? `${display(value)}-${stamp}` : display(value)} className="varValue">{display(value)}</code>
    </motion.article>
  );
}

export function ArrayRow({ name, values, previous }: { name: string; values: SnapshotValue[]; previous?: SnapshotValue[] }) {
  const { t } = useT();
  return (
    <article className="arrayBlock">
      <div className="arrayTitle"><code>{name}</code><span>{t.items(values.length)}</span></div>
      <div className="arrayRow">
        <AnimatePresence mode="popLayout" initial={false}>
          {values.map((value, index) => {
            const changed = previous !== undefined && JSON.stringify(previous[index]) !== JSON.stringify(value);
            return (
              <motion.div layout layoutId={`${name}-${String(value)}-${index}`} className={`arrayCell${changed ? " changed" : ""}`} key={`${index}-${String(value)}`} transition={stageTransition()}>
                <small>{index}</small><code>{display(value)}</code>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </article>
  );
}

function CallStack({ frames }: { frames: CallFrame[] }) {
  const { t } = useT();
  if (!frames.length) return null;
  const ordered = [...frames].reverse();
  return (
    <section className="callStack" aria-label={t.callStack} data-testid="call-stack">
      <header className="sectionHeader"><h3>{t.callStack}</h3><span>{t.frames(frames.length)}</span></header>
      <ol className="callStackList">
        <AnimatePresence initial={false}>
          {ordered.map((frame, index) => (
            <motion.li layout key={frame.id} className={`callFrame${index === 0 ? " activeFrame" : ""}`} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={stageTransition()}>
              <div className="frameHeader"><code>{frame.name}()</code>{index === 0 && <span>{t.running}</span>}</div>
              <div className="frameLocals">
                {Object.entries(frame.locals).map(([name, value]) => <code key={name}>{name} = {display(value)}</code>)}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </section>
  );
}

const isArray = (value: SnapshotValue): value is SnapshotValue[] => Array.isArray(value);

/** Variables and console output for one step. */
export function StatePanel({ trace, index }: { trace: Trace; index: number }) {
  const { t } = useT();
  const step = trace[index];
  const scope = visibleScope(step);
  const changed = new Set(changedNames(trace, index));
  const variables = Object.entries(scope).filter(([, value]) => !isArray(value));
  const output = step ? trace.slice(0, index + 1).flatMap((item) => item.event.output !== undefined ? [{ id: item.id, text: item.event.output }] : []) : [];
  return (
    <div className="statePanel">
      <section className="stateSection" aria-label={t.variables}>
        <header className="sectionHeader"><h3>{t.variables}</h3><span>{variables.length}</span></header>
        {variables.length
          ? <div className="variableGrid">{variables.map(([name, value]) => <VarBox key={name} name={name} value={value} changed={changed.has(name)} stamp={index} />)}</div>
          : <p className="muted">{step ? t.noVariables : t.runToSeeVariables}</p>}
      </section>
      <section className="stateSection console" aria-label={t.console}>
        <header className="sectionHeader"><h3>{t.console}</h3><span>{output.length}</span></header>
        <pre>{output.length ? output.map((line) => <span key={line.id} className={line.id === index || line.id === index - 1 ? "fresh" : undefined}>{line.text}{"\n"}</span>) : <span className="muted">{t.noOutput}</span>}</pre>
      </section>
    </div>
  );
}

/** Arrays and the call stack for one step. */
export function MemoryPanel({ trace, index }: { trace: Trace; index: number }) {
  const { t } = useT();
  const step = trace[index];
  const scope = visibleScope(step);
  const before = visibleScope(trace[index - 1]);
  const arrays = Object.entries(scope).filter((entry): entry is [string, SnapshotValue[]] => isArray(entry[1]));
  const frames = step?.scopes.stack ?? [];
  if (!arrays.length && !frames.length) return <p className="memoryEmpty">{step ? t.memoryHint : t.memoryEmpty}</p>;
  return (
    <div className="memoryPanel">
      <CallStack frames={frames} />
      {arrays.map(([name, values]) => <ArrayRow key={name} name={name} values={values} previous={index > 0 && isArray(before[name] as SnapshotValue) ? before[name] as SnapshotValue[] : undefined} />)}
    </div>
  );
}

interface FlowStageProps {
  trace: Trace;
  index: number;
  flow?: FlowGraph;
  path?: FlowPath;
  playing: boolean;
}

/** Flowchart with the operation pill and the step caption. */
export function FlowStage({ trace, index, flow, path, playing }: FlowStageProps) {
  const { t, lang } = useT();
  const step = trace[index];
  if (!step) {
    return (
      <section className="empty">
        <div className="emptyMark">▶</div>
        <h2>{t.readyTitle}</h2>
        <p>{t.readyBody}</p>
      </section>
    );
  }
  const nodeId = path?.nodes[index];
  const label = flow?.nodes.find((node) => node.id === nodeId)?.label;
  const story = narrate(trace, index, step.kind === "condition" ? label : undefined, lang);
  return (
    <section className={`flowStage${playing ? " playing" : ""}`}>
      <div className="pillRow">
        <span key={`${index}-pill`} className={`opPill tone-${story.tone}`}>{story.pill}</span>
        <span className="lineBadge">{t.line} {step.line}</span>
      </div>
      {flow && path ? <FlowChart flow={flow} path={path} index={index} /> : <p className="memoryEmpty">{t.noFlow}</p>}
      <p className="caption" aria-live="polite"><strong>{t.step} {index + 1}</strong><span key={index}>{story.caption}</span></p>
    </section>
  );
}
