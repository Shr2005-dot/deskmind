"use client";

import { useEffect, useState } from "react";
import { useThemeStore } from "@/lib/theme-store";
import { getEffectiveTheme } from "@/lib/theme";

type Theme = "light" | "dark" | "system";

const LABELS: Record<Theme, string> = {
  light: "Switch to dark mode",
  dark: "Switch to light mode",
  system: "Use system theme",
};

const SUN = (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
    />
  </svg>
);

const MOON = (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
    />
  </svg>
);

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useThemeStore();
  const [mounted, setMounted] = useState(false);
  const [osDark, setOsDark] = useState(false);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    setMounted(true);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setOsDark(media.matches);
    const onChange = () => setOsDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const effective = mounted ? getEffectiveTheme(theme) : "light";
  const showDark = theme === "dark" || (theme === "system" && osDark);

  // Always switch to the opposite explicit theme so a single click reliably
  // changes light <-> dark (no "system" no-op when the OS already matches).
  const nextTheme: Theme =
    theme === "system"
      ? osDark
        ? "light"
        : "dark"
      : theme === "light"
      ? "dark"
      : "light";

  const handleClick = () => {
    setSpinning(true);
    setTheme(nextTheme);
    setTimeout(() => setSpinning(false), 350);
  };

  return (
    <button
      onClick={handleClick}
      className={`relative flex w-9 h-9 shrink-0 items-center justify-center rounded-lg border border-border text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all duration-200 ease-out active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary-500 ${className ?? ""}`}
      aria-label={LABELS[theme]}
      title={effective === "dark" ? "Dark mode" : "Light mode"}
    >
      <span
        className="pointer-events-none absolute inset-0 flex items-center justify-center transition-transform duration-350 ease-out"
        style={{
          transform: spinning ? "rotate(180deg)" : "rotate(0deg)",
        }}
      >
        {showDark ? MOON : SUN}
      </span>
      <span className="sr-only">{effective} mode</span>
    </button>
  );
}
