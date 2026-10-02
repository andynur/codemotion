import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";
const storageKey = "codemotion-theme";

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(storageKey);
    return value === "dark" || value === "light" ? value : null;
  } catch { return null; }
}

/** Dark by default; the choice is remembered per browser. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? "dark");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem(storageKey, theme); } catch { /* storage can be unavailable */ }
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((value) => value === "dark" ? "light" : "dark"), []);
  return { theme, toggleTheme };
}
