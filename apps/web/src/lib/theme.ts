import * as React from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";
const EVENT_NAME = "kuberfy-theme";

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(): Theme | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
}

export function getTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

export function setTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function useTheme() {
  const [theme, setThemeState] = React.useState<Theme>(() => (typeof window === "undefined" ? "light" : getTheme()));

  React.useEffect(() => {
    const sync = () => setThemeState(getTheme());
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = React.useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme]);

  return { theme, toggle };
}
