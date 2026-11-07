"use client";

import { useSyncExternalStore } from "react";

type Theme = "auto" | "light" | "dark";
const STORAGE_KEY = "leafscore-theme";
const cycle: Theme[] = ["auto", "light", "dark"];
const icons: Record<Theme, string> = { auto: "\u{1F317}", light: "☀️", dark: "\u{1F319}" };

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "auto";
}

export function ThemeToggle() {
  // The server can't read localStorage, so it renders "auto" until hydrated.
  const theme = useSyncExternalStore(subscribe, getTheme, () => "auto" as const);

  function toggle() {
    const next = cycle[(cycle.indexOf(theme) + 1) % cycle.length];

    if (next === "auto") {
      localStorage.removeItem(STORAGE_KEY);
      document.documentElement.removeAttribute("data-theme");
    } else {
      localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.setAttribute("data-theme", next);
    }
    listeners.forEach((listener) => listener());
  }

  return (
    <button className="btn btn-ghost btn-sm" onClick={toggle} aria-label="Toggle theme">
      {icons[theme]}
    </button>
  );
}
