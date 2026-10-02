# Code Motion Visualizer agent rules

Read `DESIGN.md` before changing any UI.

- Use only design values emitted by `src/styles/tokens.css`. Never hard-code colors, spacing, radii, shadows, or motion durations in UI styles.
- Prefer Bun built-ins. Do not add packages outside the allowlist in `MASTER_PROMPT.md` without user approval.
- Keep tracing server-authoritative within the worker: parse, instrument, execute, then render immutable trace snapshots.
- Never evaluate user code on the browser main thread.
- Keep renderer components pure functions of the selected trace step.
- Run `bun test` and `bun run build` before finishing.

## Theme and motion

- Dark is the default theme; light is optional. `scripts/gen-tokens.ts` emits light tokens on `:root` from `DESIGN.md` and dark overrides on `:root[data-theme="dark"]` from `docs/DESIGN.dark.md` (Atlassian's dark variant). Style with the same token names; never branch on the theme in CSS.
- The flowchart stage may use `--motion-easing-spring` for trace-step focus (active node, pill, changed values, line bar). This is a deliberate product exception to the DESIGN.md "no bounce" rule. Keep the rest of the chrome on the practical and bold curves.
- The flowchart is built in the worker (`src/tracer/flow.ts`) and mapped to trace steps by `src/stage/flowModel.ts`.
