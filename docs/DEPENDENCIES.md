# Dependencies

Code Motion Visualizer targets Bun 1.4.2 and uses Bun for package management, TypeScript/JSX and CSS compilation, the development server, production bundles, tests, YAML/Markdown processing, and smoke testing.

## Runtime packages

- `react`, `react-dom`: component rendering; Bun provides compilation but no UI runtime.
- `@codemirror/state`, `@codemirror/view`, `@codemirror/lang-javascript`, `@codemirror/commands`, `@codemirror/language`: CodeMirror 6 editor primitives; browsers and Bun do not provide a code editor.
- `motion`: layout and presence animation; the browser has no declarative React layout-diff primitive.
- `acorn`, `acorn-walk`, `astring`: parse, traverse, and regenerate user JavaScript. Bun can execute JavaScript but does not expose these AST operations.
- `react-resizable-panels`: accessible resizable workspace panes; the platform has no equivalent complete interaction primitive.
- `@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono`: self-hosted, openly licensed substitutes for Atlassian Sans and Atlassian Mono. Charlie fonts are intentionally not used.

## Development packages

- `@types/bun`, `@types/react`, `@types/react-dom`: editor type declarations only. Bun performs the build; TypeScript is not installed as a compiler.

No dependency outside the master prompt's allowlist is installed.

## Bun 1.4.2 deviation

The installed Bun live HTML-route bundler omits CSS-module bindings and throws at runtime even though the same module imports succeed in production builds. The app therefore uses Bun-bundled component-local plain CSS files with explicit class names. This preserves the zero-tooling CSS pipeline and working HMR; no CSS package was added.
