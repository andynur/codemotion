import { AnimatePresence, motion } from "motion/react";
import type { CallFrame, SnapshotValue, Step, Trace } from "../tracer/types";
import { stageTransition } from "./motion";
import "./stage.css";

const styles = { activeFrame: "activeFrame", arrayBlock: "arrayBlock", arrayCell: "arrayCell", arrayRow: "arrayRow", arrayTitle: "arrayTitle", badges: "badges", branch: "branch", callFrame: "callFrame", callStack: "callStack", callStackHeader: "callStackHeader", callStackList: "callStackList", console: "console", danger: "danger", empty: "empty", emptyMark: "emptyMark", eyebrow: "eyebrow", frameHeader: "frameHeader", frameLocals: "frameLocals", lineBadge: "lineBadge", lozenge: "lozenge", stage: "stage", stageHeader: "stageHeader", success: "success", varBox: "varBox", variableGrid: "variableGrid", varName: "varName" } as const;

const display = (value: SnapshotValue) => {
  if (value === undefined) return "undefined";
  return typeof value === "string" ? `“${value}”` : JSON.stringify(value);
};

export function VarBox({ name, value }: { name: string; value: SnapshotValue }) {
  return (
    <motion.article layout className={styles.varBox} transition={stageTransition()}>
      <span className={styles.varName}>{name}</span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.code key={display(value)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={stageTransition()}>{display(value)}</motion.code>
      </AnimatePresence>
    </motion.article>
  );
}

export function ArrayRow({ name, values }: { name: string; values: SnapshotValue[] }) {
  return (
    <article className={styles.arrayBlock}>
      <div className={styles.arrayTitle}><code>{name}</code><span>{values.length} items</span></div>
      <div className={styles.arrayRow}>
        <AnimatePresence mode="popLayout" initial={false}>
          {values.map((value, index) => (
            <motion.div layout layoutId={`${name}-${String(value)}-${index}`} className={styles.arrayCell} key={`${index}-${String(value)}`} transition={stageTransition()}>
              <small>{index}</small><code>{display(value)}</code>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </article>
  );
}

function LoopBadge({ step }: { step: Step }) {
  const loopVariable = Object.entries(step.scopes.global).find(([key, value]) => typeof value === "number" && ["i", "j", "left", "right", "end"].includes(key));
  const condition = step.kind === "condition" ? Boolean(step.event.detail) : undefined;
  return (
    <div className={styles.badges}>
      {(step.kind === "loop" || step.kind === "condition") && <span className={styles.lozenge}>Loop {loopVariable ? `${loopVariable[0]} = ${loopVariable[1]}` : "iteration"}</span>}
      {condition !== undefined && <span className={condition ? styles.success : styles.danger}>Condition: {String(condition)}</span>}
      {step.kind === "call" && <span className={styles.lozenge}>Call {String(step.event.detail)}()</span>}
      {step.kind === "return" && <span className={styles.lozenge}>Return {display(step.event.returnValue)}</span>}
    </div>
  );
}

function CallStack({ frames }: { frames: CallFrame[] }) {
  if (!frames.length) return null;
  const ordered = [...frames].reverse();
  return (
    <section className={styles.callStack} aria-label="Call stack">
      <header className={styles.callStackHeader}><h3>Call stack</h3><span>{frames.length} {frames.length === 1 ? "frame" : "frames"}</span></header>
      <ol className={styles.callStackList}>
        <AnimatePresence initial={false}>
          {ordered.map((frame, index) => (
            <motion.li layout key={frame.id} className={`${styles.callFrame} ${index === 0 ? styles.activeFrame : ""}`} transition={stageTransition()}>
              <div className={styles.frameHeader}><code>{frame.name}()</code>{index === 0 && <span>Running</span>}</div>
              <div className={styles.frameLocals}>
                {Object.entries(frame.locals).map(([name, value]) => <code key={name}>{name} = {display(value)}</code>)}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </section>
  );
}

function BranchIndicator({ step }: { step: Step }) {
  if (step.kind !== "branch") return null;
  return <div className={styles.branch}>Taken branch: <strong>{step.event.detail}</strong></div>;
}

export function Stage({ step, trace }: { step?: Step; trace: Trace }) {
  if (!step) return <section className={styles.empty}><div className={styles.emptyMark}>▶</div><h2>Ready to visualize</h2><p>Run the code, then move through the generated timeline.</p></section>;
  const values = Object.entries(step.scopes.global);
  const variables = values.filter(([, value]) => !Array.isArray(value));
  const arrays = values.filter(([, value]) => Array.isArray(value)) as [string, SnapshotValue[]][];
  const output = trace.slice(0, step.id + 1).flatMap((item) => item.event.output ? [item.event.output] : []);
  return (
    <section className={styles.stage} aria-live="polite">
      <header className={styles.stageHeader}>
        <div><span className={styles.eyebrow}>Step {step.id + 1} of {trace.length}</span><h2>{step.kind.replace("-", " ")}</h2></div>
        <span className={styles.lineBadge}>Line {step.line}</span>
      </header>
      <LoopBadge step={step} />
      <BranchIndicator step={step} />
      <CallStack frames={step.scopes.stack ?? []} />
      {arrays.map(([name, value]) => <ArrayRow key={name} name={name} values={value} />)}
      <div className={styles.variableGrid}>{variables.map(([name, value]) => <VarBox key={name} name={name} value={value} />)}</div>
      <section className={styles.console} aria-label="Console output"><header>Console</header><pre>{output.length ? output.join("\n") : "No output yet"}</pre></section>
    </section>
  );
}
