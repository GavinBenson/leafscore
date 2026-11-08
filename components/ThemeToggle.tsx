"use client";

type Theme = "auto" | "light" | "dark";
const STORAGE_KEY = "leafscore-theme";
const cycle: Theme[] = ["auto", "light", "dark"];

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "auto";
  } catch {
    return "auto";
  }
}

// Icon and label are shown by CSS from <html data-theme> (set by the inline
// script in layout.tsx before paint), so nothing flips after hydration.
export function ThemeToggle() {
  function toggle() {
    const next = cycle[(cycle.indexOf(readTheme()) + 1) % cycle.length];
    try {
      if (next === "auto") {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      // Private mode: the theme still changes for this page view.
    }
    if (next === "auto") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", next);
    }
  }

  return (
    <button type="button" className="btn btn-ghost theme-toggle" onClick={toggle}>
      <span className="theme-state theme-state-auto">
        <span aria-hidden="true">{"\u{1F317}"}</span>
        <span className="visually-hidden">Theme: matches your device. Switch to light.</span>
      </span>
      <span className="theme-state theme-state-light">
        <span aria-hidden="true">{"☀️"}</span>
        <span className="visually-hidden">Theme: light. Switch to dark.</span>
      </span>
      <span className="theme-state theme-state-dark">
        <span aria-hidden="true">{"\u{1F319}"}</span>
        <span className="visually-hidden">Theme: dark. Switch to match your device.</span>
      </span>
    </button>
  );
}
