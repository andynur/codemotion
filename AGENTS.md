# Code Motion Visualizer agent rules

Read `DESIGN.md` before changing any UI.

- Use only design values emitted by `src/styles/tokens.css`. Never hard-code colors, spacing, radii, shadows, or motion durations in UI styles.
- Prefer Bun built-ins. Do not add packages outside the allowlist in `MASTER_PROMPT.md` without user approval.
- Keep tracing server-authoritative within the worker: parse, instrument, execute, then render immutable trace snapshots.
- Never evaluate user code on the browser main thread.
- Keep renderer components pure functions of the selected trace step.
- Run `bun test` and `bun run build` before finishing.
