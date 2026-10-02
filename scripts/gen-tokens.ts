type TokenTree = Record<string, unknown>;

async function readDesign(path: string) {
  const source = await Bun.file(path).text();
  const end = source.indexOf("\n---\n", 4);
  if (!source.startsWith("---\n") || end < 0) throw new Error(`${path} must begin with YAML frontmatter`);
  return Bun.YAML.parse(source.slice(4, end)) as TokenTree;
}

const design = await readDesign("DESIGN.md");
// Atlassian's dark variant, fetched from https://atlassian.design/DESIGN.dark.md.
const dark = await readDesign("docs/DESIGN.dark.md");
const sectionNames: Record<string, string> = {
  colors: "color",
  rounded: "radius",
  spacing: "space",
  borders: "border",
  typography: "font",
  surfaces: "surface",
  motion: "motion",
};

const declarations: string[] = [];
const normalize = (value: string) => value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
const resolveReference = (value: string) => {
  const match = value.match(/^\{([^.}]+)\.([^}]+)\}$/);
  if (!match) return value;
  const [, section, path] = match;
  const prefix = sectionNames[section ?? ""] ?? section;
  return `var(--${prefix}-${normalize((path ?? "").replaceAll(".", "-"))})`;
};

function flatten(prefix: string, value: unknown, path: string[] = [], into = declarations) {
  if (typeof value === "string" || typeof value === "number") {
    into.push(`  --${prefix}-${path.map(normalize).join("-")}: ${resolveReference(String(value))};`);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as TokenTree)) flatten(prefix, child, [...path, key], into);
}

const darkDeclarations: string[] = [];
for (const [section, prefix] of Object.entries(sectionNames)) {
  flatten(prefix, design[section]);
  flatten(prefix, dark[section], [], darkDeclarations);
}
// Only emit dark values that differ from the light theme.
const lightSet = new Set(declarations);
const darkOverrides = darkDeclarations.filter((declaration) => !lightSet.has(declaration));

const aliases = [
  "  --shadow-raised: var(--surface-raised-shadow);",
  "  --shadow-overlay: var(--surface-overlay-shadow);",
  "  --shadow-overflow: var(--surface-overflow-shadow);",
  "  --surface-default: var(--surface-default-background-color);",
  "  --surface-sunken: var(--surface-sunken-background-color);",
  "  --surface-raised: var(--surface-raised-background-color);",
].join("\n");

const output = `/* Generated from DESIGN.md and docs/DESIGN.dark.md by scripts/gen-tokens.ts. Do not edit. */
:root {\n${declarations.join("\n")}\n${aliases}\n}\n
:root[data-theme="dark"] {\n${darkOverrides.join("\n")}\n}\n`;
await Bun.write("src/styles/tokens.css", output);
console.log(`Generated ${declarations.length + 6} CSS custom properties and ${darkOverrides.length} dark overrides.`);
