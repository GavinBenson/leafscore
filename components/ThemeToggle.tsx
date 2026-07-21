"use client";

import { useState, useEffect } from "react";

type Theme = "auto" | "light" | "dark";
const cycle: Theme[] = ["auto", "light", "dark"];
const icons: Record<Theme, string> = { auto: "\u{1F317}", light: "☀️", dark: "\u{1F319}" };

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("auto");

  useEffect(() => {
    const stored = localStorage.getItem("leafscore-theme");
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    }
  }, []);

  function toggle() {
    const next = cycle[(cycle.indexOf(theme) + 1) % cycle.length];
    setTheme(next);

    if (next === "auto") {
      localStorage.removeItem("leafscore-theme");
      document.documentElement.removeAttribute("data-theme");
    } else {
      localStorage.setItem("leafscore-theme", next);
      document.documentElement.setAttribute("data-theme", next);
    }
  }

  return (
    <button className="btn btn-ghost btn-sm" onClick={toggle} aria-label="Toggle theme">
      {icons[theme]}
    </button>
  );
}
