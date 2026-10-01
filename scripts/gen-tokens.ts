type TokenTree = Record<string, unknown>;

const source = await Bun.file("DESIGN.md").text();
const marker = "\n---\n";
const end = source.indexOf(marker, 4);
if (!source.startsWith("---\n") || end < 0) {
  throw new Error("DESIGN.md must begin with YAML frontmatter");
}

const design = Bun.YAML.parse(source.slice(4, end)) as TokenTree;
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

function flatten(prefix: string, value: unknown, path: string[] = []) {
  if (typeof value === "string" || typeof value === "number") {
    declarations.push(`  --${prefix}-${path.map(normalize).join("-")}: ${resolveReference(String(value))};`);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as TokenTree)) flatten(prefix, child, [...path, key]);
}

for (const [section, prefix] of Object.entries(sectionNames)) {
  flatten(prefix, design[section]);
}

const aliases = [
  "  --shadow-raised: var(--surface-raised-shadow);",
  "  --shadow-overlay: var(--surface-overlay-shadow);",
  "  --shadow-overflow: var(--surface-overflow-shadow);",
  "  --surface-default: var(--surface-default-background-color);",
  "  --surface-sunken: var(--surface-sunken-background-color);",
  "  --surface-raised: var(--surface-raised-background-color);",
].join("\n");

const output = `/* Generated from DESIGN.md by scripts/gen-tokens.ts. Do not edit. */\n:root {\n${declarations.join("\n")}\n${aliases}\n}\n`;
await Bun.write("src/styles/tokens.css", output);
console.log(`Generated ${declarations.length + 6} CSS custom properties.`);
