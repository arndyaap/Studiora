"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light";
const STORAGE_KEY = "studiora-theme";

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "dark",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function apply(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#101827" : "#F0F2F5");
}

export function ThemeProvider({ initialTheme, children }: { initialTheme?: Theme; children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    // Sumber kebenaran: pengaturan tersimpan di database (jika ada), lalu cache lokal.
    let stored: Theme | null = null;
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "dark" || v === "light") stored = v;
    } catch {}
    const next = initialTheme ?? stored ?? "dark";
    setThemeState(next);
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, [initialTheme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    apply(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {}
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

/** Skrip inline agar tema tersimpan langsung diterapkan sebelum render (tanpa kedip). */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
