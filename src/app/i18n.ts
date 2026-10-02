import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Lang = "id" | "en";
const storageKey = "codemotion-lang";

const en = {
  brandTagline: "Visualizer",
  home: "Code Motion home",
  run: "Run code",
  tracing: "Tracing…",
  share: "Share",
  shareTitle: "Copy a shareable URL",
  linkCopied: "Link copied",
  themeTitle: "Toggle theme (T)",
  switchTheme: (next: string) => `Switch to ${next} theme`,
  langTitle: "Switch language (L)",
  first: "First step",
  back: "Step back",
  play: "Play",
  pause: "Pause",
  forward: "Step forward",
  last: "Last step",
  playTitle: "Play or pause (Space)",
  timeline: "Timeline",
  speed: "Speed",
  player: "Playback",
  code: "Code",
  example: "Example",
  customCode: "Custom code",
  line: "Line",
  lines: "lines",
  runHint: "to run",
  flow: "Flow",
  steps: (count: number) => `${count} steps`,
  notRun: "Not run",
  memory: "Memory",
  memoryMeta: "arrays · call stack",
  stepLimit: "Step limit reached",
  traceFailed: "Could not trace this code",
  variables: "Variables",
  console: "Console",
  noVariables: "No variables yet",
  runToSeeVariables: "Run the code to see variables",
  noOutput: "No output yet",
  callStack: "Call stack",
  frames: (count: number) => `${count} ${count === 1 ? "frame" : "frames"}`,
  running: "Running",
  items: (count: number) => `${count} items`,
  memoryHint: "Arrays and function calls appear here.",
  memoryEmpty: "Nothing in memory yet.",
  readyTitle: "Ready to visualize",
  readyBody: "Run the code, then follow the line through the flowchart.",
  noFlow: "The flowchart is unavailable for this code.",
  step: "Step",
  flowLabel: "Flowchart of the program",
  editorLabel: "JavaScript editor",
};

export type Dictionary = typeof en;

const id: Dictionary = {
  brandTagline: "Visualisasi",
  home: "Beranda Code Motion",
  run: "Jalankan",
  tracing: "Menelusuri…",
  share: "Bagikan",
  shareTitle: "Salin URL untuk dibagikan",
  linkCopied: "Link tersalin",
  themeTitle: "Ganti tema (T)",
  switchTheme: (next) => `Ganti ke tema ${next === "dark" ? "gelap" : "terang"}`,
  langTitle: "Ganti bahasa (L)",
  first: "Langkah pertama",
  back: "Mundur satu langkah",
  play: "Putar",
  pause: "Jeda",
  forward: "Maju satu langkah",
  last: "Langkah terakhir",
  playTitle: "Putar atau jeda (Spasi)",
  timeline: "Linimasa",
  speed: "Kecepatan",
  player: "Pemutar",
  code: "Kode",
  example: "Contoh",
  customCode: "Kode sendiri",
  line: "Baris",
  lines: "baris",
  runHint: "untuk menjalankan",
  flow: "Alur",
  steps: (count) => `${count} langkah`,
  notRun: "Belum dijalankan",
  memory: "Memori",
  memoryMeta: "array · call stack",
  stepLimit: "Batas langkah tercapai",
  traceFailed: "Kode ini tidak bisa ditelusuri",
  variables: "Variabel",
  console: "Konsol",
  noVariables: "Belum ada variabel",
  runToSeeVariables: "Jalankan kode untuk melihat variabel",
  noOutput: "Belum ada output",
  callStack: "Call stack",
  frames: (count) => `${count} frame`,
  running: "Berjalan",
  items: (count) => `${count} item`,
  memoryHint: "Array dan pemanggilan fungsi muncul di sini.",
  memoryEmpty: "Memori masih kosong.",
  readyTitle: "Siap divisualisasikan",
  readyBody: "Jalankan kode, lalu ikuti garisnya di diagram alur.",
  noFlow: "Diagram alur tidak tersedia untuk kode ini.",
  step: "Langkah",
  flowLabel: "Diagram alur program",
  editorLabel: "Editor JavaScript",
};

export const dictionaries: Record<Lang, Dictionary> = { en, id };

function storedLang(): Lang | null {
  try {
    const value = localStorage.getItem(storageKey);
    return value === "id" || value === "en" ? value : null;
  } catch { return null; }
}

/** Indonesian by default; the choice is remembered per browser. */
export function useLang() {
  const [lang, setLang] = useState<Lang>(() => storedLang() ?? "id");

  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem(storageKey, lang); } catch { /* storage can be unavailable */ }
  }, [lang]);

  const toggleLang = useCallback(() => setLang((value) => value === "id" ? "en" : "id"), []);
  return { lang, setLang, toggleLang };
}

export const LangContext = createContext<Lang>("id");

export function useT() {
  const lang = useContext(LangContext);
  return { lang, t: dictionaries[lang] };
}
