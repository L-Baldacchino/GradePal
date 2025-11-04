// app/theme/ThemeProvider.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { StatusBar } from "react-native";

export type Palette = {
  name: "dark" | "light";
  // surfaces
  bg: string;
  card: string;
  border: string;
  navBg: string;
  // text
  text: string;
  textMuted: string;
  navText: string;
  // accents
  primary: string;
  primaryText: string;
  success: string;
  danger: string;
};

const DARK_NAVY: Palette = {
  name: "dark",
  bg: "#0b1220",
  card: "#0f1b2e",
  border: "#1f2a44",
  navBg: "#0b1220",
  text: "#e6eaff",
  textMuted: "#a6b0cf",
  navText: "#e6eaff",
  primary: "#3b82f6",
  primaryText: "#ffffff",
  success: "#22c55e",
  danger: "#ef4444",
};

const LAVENDER: Palette = {
  name: "light",
  bg: "#F4F1FA",
  card: "#FFFFFF",
  border: "#E2DFF2",
  navBg: "#F4F1FA",
  text: "#2D2448",
  textMuted: "#6B6287",
  navText: "#2D2448",
  primary: "#7C3AED",
  primaryText: "#ffffff",
  success: "#16a34a",
  danger: "#dc2626",
};

type ThemeContextType = {
  theme: Palette;
  toggleTheme: () => void;
  setThemeName: (name: "dark" | "light") => void;
};

const ThemeContext = createContext<ThemeContextType | null>(null);
const STORAGE_KEY = "app:theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeNameState] = useState<"dark" | "light">("dark");

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === "light" || saved === "dark") setThemeNameState(saved);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, themeName).catch(() => {});
  }, [themeName]);

  const theme = useMemo(() => (themeName === "dark" ? DARK_NAVY : LAVENDER), [themeName]);

  function toggleTheme() {
    setThemeNameState((prev) => (prev === "dark" ? "light" : "dark"));
  }
  function setThemeName(name: "dark" | "light") {
    setThemeNameState(name);
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setThemeName }}>
      <StatusBar barStyle={theme.name === "dark" ? "light-content" : "dark-content"} backgroundColor={theme.navBg} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
