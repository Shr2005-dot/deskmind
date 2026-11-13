"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/lib/theme-store";
import { applyTheme } from "@/lib/theme";

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    applyTheme(theme);

    // Follow OS preference changes while the user is on "system" mode.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (theme === "system") applyTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  return <>{children}</>;
}
