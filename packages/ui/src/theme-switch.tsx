"use client";
import { useEffect, useState } from "react";
import { cx, Icon, type IconName } from "./components.tsx";

type Mode = "system" | "light" | "dark";
const KEY = "intu-theme";
const MODES: { mode: Mode; icon: IconName; label: string }[] = [
  { mode: "system", icon: "monitor", label: "Match device" },
  { mode: "light", icon: "sun", label: "Light" },
  { mode: "dark", icon: "moon", label: "Dark" },
];

function apply(mode: Mode) {
  if (mode === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
}

/** Inline in <head> so the saved theme applies before first paint. */
export const themeBootScript = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

/** Light, dark or follow the device. Remembered on this device only. */
export function ThemeSwitch({ className }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") setMode(saved);
    } catch {
      // Storage can be unavailable (private windows); the device setting still applies.
    }
  }, []);

  const choose = (m: Mode) => {
    setMode(m);
    apply(m);
    try {
      if (m === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, m);
    } catch {
      // Not remembered, but applied for this visit.
    }
  };

  return (
    <div role="radiogroup" aria-label="Colour theme" className={cx("inline-flex rounded-lg bg-white/5 p-0.5 ring-1 ring-inset ring-white/10", className)}>
      {MODES.map((m) => (
        <button
          key={m.mode}
          type="button"
          role="radio"
          aria-checked={mode === m.mode}
          title={m.label}
          aria-label={m.label}
          onClick={() => choose(m.mode)}
          className={cx("rounded-md p-1.5 transition-colors", mode === m.mode ? "bg-white/15 text-rail-fg" : "text-rail-muted hover:text-rail-fg")}
        >
          <Icon name={m.icon} className="size-4" />
        </button>
      ))}
    </div>
  );
}
