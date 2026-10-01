# Master Prompt: Init "Code Motion Visualizer" (Bun 1.4+)

> Paste this whole file into your coding agent (Claude Code, etc.) at the root of an empty folder.
> The prompt is in English on purpose, for agent accuracy. Background notes: `insights/code-motion-visualizer-web-app.md`.

---

## Role and goal

You are a senior frontend engineer. Initialize and build the MVP of **Code Motion Visualizer**: a browser-only web app with two panels.

- **Left:** an embedded code editor where the user writes JavaScript.
- **Right:** a stage that animates how that code executes step by step, to teach programming basics (variables, `for`/`while` loops, `if/else`, arrays, and later functions/call stack).
- **Bottom/top bar:** Run, Step back, Step forward, Play/Pause, speed, and a timeline scrubber.

Everything runs in the browser. No backend, no database, no auth.

## Hard rule: Bun built-ins first

Target **Bun >= 1.4** on macOS (Apple Silicon, M1 Pro). Before adding any dependency, check whether Bun already does it. Only install a package when Bun has no built-in for that job. Keep a short `docs/DEPENDENCIES.md` justifying every package you add.

Use these Bun built-ins, and do NOT install the alternatives in brackets:

| Job | Use (built-in) | Do not install |
|---|---|---|
| Package manager, scripts | `bun install`, `bun run` | npm, pnpm, yarn |
| TS/JSX transpile | Bun | tsc for building, Babel, SWC |
| Dev server + HMR | `Bun.serve()` with HTML imports (`import index from "./index.html"`), `development: { hmr: true }` | Vite, webpack, Parcel |
| Production bundle | `bun build ./src/index.html --outdir dist --minify` | Vite, Rollup, esbuild |
| Single-file shareable build | `bun build --compile --target=browser` (inlines everything into one HTML) | any inliner plugin |
| React optimization | Bun's built-in React Compiler (1.4) | babel-plugin-react-compiler |
| CSS bundling, CSS modules, nesting | Bun CSS bundler (`*.module.css`) | PostCSS, Tailwind, Sass, styled-components |
| Unit tests | `bun test` (use `--parallel`, `--changed`) with `bun:test` | Vitest, Jest |
| DOM in tests (if needed) | `@happy-dom/global-registrator` is allowed only if `bun test` truly needs a DOM | jsdom |
| YAML parsing (DESIGN.md frontmatter) | `Bun.YAML.parse` | js-yaml, gray-matter |
| Markdown rendering (in-app help/lessons) | `Bun.markdown` at build/serve time | marked, remark |
| Headless smoke test / screenshots / future video capture | `Bun.WebView` | Playwright, Puppeteer |
| Bundle size report | `bun build --metafile-md` | rollup-plugin-visualizer |
| Env vars | Bun auto `.env` | dotenv |

Before relying on any built-in above, confirm it exists in the installed version (`bun --version`, `bun build --help`, `bun test --help`, or the docs at bun.com/docs). If one is missing or behaves differently, say so, pick the smallest alternative, and record it in `docs/DEPENDENCIES.md`.

Note these Bun 1.4 breaking changes: a CSS import's default export is now `{}`, and `"jsx": "react-jsx"` emits `jsx` (not `jsxDEV`) by default.

### Allowed packages (Bun has no equivalent)

- `react`, `react-dom`
- `@codemirror/state`, `@codemirror/view`, `@codemirror/lang-javascript`, `@codemirror/commands`, `@codemirror/language` (use CodeMirror 6 directly with a small React wrapper; `@uiw/react-codemirror` only if the wrapper becomes painful)
- `motion` (import from `motion/react`) for all animation
- `acorn`, `acorn-walk`, `astring` for parsing, walking and regenerating user code
- `react-resizable-panels` for the split layout
- Fonts: `@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono` (fallbacks for Atlassian Sans/Mono, see Phase 5)
- Dev only: `@types/react`, `@types/react-dom`, `@types/bun`

Anything else needs a justification in `docs/DEPENDENCIES.md`. Use React state (`useReducer` + context, or `useSyncExternalStore`) instead of a state library.

## Architecture (do not deviate)

**Trace first, animate later.**

1. **Parse** user code with Acorn into an AST.
2. **Instrument**: with acorn-walk, inject `__t(event)` calls before and after statements, on assignments, on each loop test and iteration, on `if` branch choice, and wrap array mutations (`push`, `pop`, `shift`, `unshift`, `splice`, index assignment, swaps). Regenerate code with astring.
3. **Execute** the instrumented code inside a **Web Worker** with a hard step limit (default 5,000) and a wall-clock timeout (the main thread terminates the worker). Never `eval` user code on the main thread.
4. The worker returns a **trace**: `Step[]`, where each step is `{ id, line, col, kind, scopes, heap, event }`. Values are deep-cloned snapshots, so any step can be rendered independently.
5. The **renderer** is a pure function of `trace[currentStep]`. Motion animates the difference between consecutive steps (`layout`, `layoutId`, `AnimatePresence`). Step back, scrub and play only change `currentStep`.

Worker bundling: use `new Worker(new URL("./tracer.worker.ts", import.meta.url), { type: "module" })`. Verify that `bun build` emits the worker correctly. If it does not, build the worker as its own entrypoint and load it by URL; document which approach worked.

### MVP JavaScript subset

Supported: `let`/`const`/`var`, numbers, strings, booleans, arrays, arithmetic and comparison, `for`, `while`, `for...of`, `break`, `continue`, `if/else`, `console.log`, and array methods `push/pop/shift/unshift/splice/length/indexOf/includes`.
Not in MVP (show a friendly "not supported yet" message with the line number): classes, async/await, generators, `try/catch`, closures over loops, objects beyond flat literals.

### Folder layout

```
/
  DESIGN.md                 # Atlassian design spec (Phase 5)
  AGENTS.md                 # rules for coding agents (Phase 5)
  CLAUDE.md                 # one line: "Read AGENTS.md and DESIGN.md first."
  bunfig.toml
  server.ts                 # Bun.serve dev server with HTML import + HMR
  scripts/
    gen-tokens.ts           # DESIGN.md frontmatter -> src/styles/tokens.css
    smoke.ts                # Bun.WebView screenshot smoke test
  src/
    index.html
    main.tsx
    app/                    # layout, toolbar, providers
    editor/                 # CodeMirror wrapper, active-line highlight
    tracer/
      instrument.ts         # Acorn + acorn-walk + astring
      runtime.ts            # __t collector, array proxies, step limit
      tracer.worker.ts
      types.ts              # Step, Event, Snapshot
      *.test.ts
    stage/                  # visual primitives: VarBox, ArrayRow, LoopBadge, BranchIndicator, CallStack
    playback/               # currentStep, play/pause, speed, scrubber
    presets/                # example programs (sum array, bubble sort, find max, reverse array, FizzBuzz)
    styles/
      tokens.css            # generated, do not edit by hand
      global.css
  docs/DEPENDENCIES.md
```

## Phases

Work phase by phase. At the end of each phase, run `bun test` and `bun run build`, then give a short summary of what changed and anything that deviated from this prompt.

### Phase 1: Scaffold
- Check `bun --version` is >= 1.4. Stop and tell me if it is not.
- `bun init` (use the React template if the installed Bun offers one; otherwise a blank init) and adapt it to the layout above.
- `server.ts` using `Bun.serve({ routes: { "/*": index }, development: { hmr: true, console: true } })`.
- Scripts in `package.json`: `dev`, `build`, `build:single`, `test`, `tokens`, `smoke`.
- Strict `tsconfig.json`.

### Phase 2: Tracer core (no UI)
- Implement `instrument.ts`, `runtime.ts`, `types.ts`.
- `bun test` covers at least: variable assignment, a counting `for` loop, `while` with `break`, `if/else` branch selection, `push/pop`, swapping two array items, step limit on an infinite loop, and an unsupported-syntax error carrying a line number.
- Snapshot the traces for the preset programs.

### Phase 3: Worker runner
- `tracer.worker.ts` plus a `runCode(source): Promise<Trace | TraceError>` helper with step limit and timeout.
- The UI thread must stay responsive when user code loops forever.

### Phase 4: UI shell
- Resizable two-panel layout (editor left, stage right), toolbar with Run / Step back / Step forward / Play-Pause / speed / scrubber, and a preset picker.
- The editor highlights the line of `currentStep` and shows trace errors inline.
- Keyboard shortcuts: Cmd+Enter runs, arrow keys step, Space plays/pauses.
- Use plain semantic HTML and CSS modules. Leave styling minimal; Phase 5 applies the design system.

### Phase 5: Design system (Atlassian DESIGN.md, Jira UI look)
1. Download Atlassian's official DESIGN.md into the repo root:
   `curl -fsSL https://atlassian.design/DESIGN.md -o DESIGN.md`
   Also fetch the short or dark variant if it exists (`https://atlassian.design/DESIGN.short.md`) and keep it as `docs/DESIGN.short.md`. Never invent tokens; if a fetch fails, stop and tell me.
2. `scripts/gen-tokens.ts`: read `DESIGN.md`, split off the YAML frontmatter, parse it with `Bun.YAML.parse`, and emit `src/styles/tokens.css` as CSS custom properties (for example `--color-text`, `--color-brand-bold`, `--space-100`, `--radius-small`, `--shadow-raised`, `--motion-duration-medium`, `--motion-ease-standard`). Map token names mechanically. Run it as `bun run tokens`.
3. Typography: the product fonts are Atlassian Sans (Inter-based) and Atlassian Mono (JetBrains Mono-based). Only use the official font files if they are publicly licensed for this use; otherwise use Inter and JetBrains Mono from `@fontsource-variable`, and note this in `docs/DEPENDENCIES.md`. Do not use the Charlie brand fonts in product UI.
4. Restyle the Phase 4 shell to look like Jira: neutral-dominant surfaces, 8px spacing rhythm, the four elevation planes, brand blue (`#1868DB` via tokens, never hard-coded) only for primary actions and focus, and the Button, Tab, Toggle, Lozenge, Badge, SectionMessage and Code recipes from DESIGN.md. The editor theme and stage visuals use the same tokens. Follow the DESIGN.md Do's and Don'ts section.
5. Motion tokens: all Motion `transition` durations and easings come from the DESIGN.md motion tokens through one `src/stage/motion.ts` module. Respect `prefers-reduced-motion`.
6. Write `AGENTS.md`: always read DESIGN.md before touching UI; use only tokens from `tokens.css`; never hard-code hex, px spacing or durations; follow the built-ins-first rule and the dependency allowlist; run `bun test` and `bun run build` before finishing.
7. Light theme is required. Add dark mode only if a dark DESIGN.md variant was fetched successfully.

### Phase 6: Stage visuals with Motion
- `VarBox`: labeled box; the value animates when it changes.
- `LoopBadge`: shows the loop variable, the condition result (true/false using success/danger tokens) and the iteration count.
- `ArrayRow`: indexed cells; pointer arrows for `arr[i]`; swaps and inserts use `layout`/`layoutId`; push and pop use `AnimatePresence`.
- `BranchIndicator`: the taken `if/else` branch lights up.
- A `console.log` output panel synced to the current step.
- Play mode advances steps using speed x motion duration tokens.

### Phase 7: Presets, share and polish
- Five presets: sum of an array, find max, reverse an array, bubble sort, FizzBuzz 1–15.
- Share: encode the source in the URL hash (base64url), and load it on open.
- Empty, error and step-limit states use SectionMessage styling.
- `bun run build:single` produces one offline-capable HTML file.

### Phase 8: Verify
- `bun test --parallel` is green.
- `bun run build` succeeds; write `dist/metafile.md` with `--metafile-md` and keep the initial JS reasonably small (report the size).
- `scripts/smoke.ts` uses `Bun.WebView` to open the built app, load the bubble sort preset, run it, step to the middle, and save `artifacts/smoke.png`. If `Bun.WebView` cannot run on this machine, say so and skip the step; do not install Playwright without asking.

## Acceptance criteria

- `bun install && bun run dev` opens the app with HMR, and the bubble sort preset animates end to end with Play, Step back and the scrubber.
- An infinite loop shows a step-limit message and the tab stays responsive.
- Every color, spacing, radius, shadow and motion value in the UI comes from `tokens.css`, which is generated from `DESIGN.md`.
- `docs/DEPENDENCIES.md` lists each installed package with the reason Bun could not do it.
- `AGENTS.md`, `CLAUDE.md` and `DESIGN.md` are at the repo root.

## Working style

- Small commits per phase with clear messages.
- When this prompt conflicts with what the installed Bun actually supports, trust the installed Bun, explain the conflict, and pick the closest option.
- Ask me before adding any dependency outside the allowlist, before changing the architecture, or before dropping a phase.
