import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type ThemeName = "dark" | "light";

type Theme = {
  name: ThemeName;
  text: string;
  textMuted: string;
  bg: string;
  card: string;
  border: string;
  navBg: string;
  navText: string;
  primary: string;
  primaryText: string;
  success: string;
  danger: string;
};

type Ctx = {
  theme: Theme;
  toggleTheme: () => void;
  setThemeName: (n: ThemeName) => void;
};

const ThemeCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "app:theme:v1";

/** Shared soft palette (same hues used in both modes) */
const palette = {
  // Lavender family (light surfaces)
  lavender50:  "#F5F3FF",
  lavender100: "#EEE7FF",
  lavender200: "#E5E0FF",
  lavenderBorder: "#E2E0F5",

  // Soft navy family (dark surfaces)
  navyBg:    "#141A26",
  navyCard:  "#1B2230",
  navyBorder:"#2A3447",
  navyHeader:"#162033",

  // Text
  textLight:       "#E6EAF2",
  textMutedDark:   "#B5BED0",
  textDark:        "#2B2F38",
  textMutedLight:  "#6B6F80",

  // Accents (shared)
  primary:     "#7C6EE6",  // soft violet
  primaryText: "#FFFFFF",
  success:     "#4CC38A",  // soft green
  danger:      "#E25563",  // soft red
};

/** Softer Dark: gentle navy, medium contrast, shared accents */
const darkTheme: Theme = {
  name: "dark",
  text: palette.textLight,
  textMuted: palette.textMutedDark,
  bg: palette.navyBg,
  card: palette.navyCard,
  border: palette.navyBorder,
  navBg: palette.navyHeader,
  navText: palette.textLight,
  primary: palette.primary,
  primaryText: palette.primaryText,
  success: palette.success,
  danger: palette.danger,
};

/** Softer Light: lavender paper, medium contrast, same accents */
const lightTheme: Theme = {
  name: "light",
  text: palette.textDark,
  textMuted: palette.textMutedLight,
  bg: palette.lavender50,
  card: "#FFFFFF",
  border: palette.lavenderBorder,
  navBg: palette.lavender100,
  navText: "#372A47",
  primary: palette.primary,
  primaryText: palette.primaryText,
  success: palette.success,
  danger: palette.danger,
};

function selectTheme(name: ThemeName): Theme {
  return name === "dark" ? darkTheme : lightTheme;
}

const ThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [name, setName] = useState<ThemeName>("dark");

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === "light" || saved === "dark") setName(saved);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, name).catch(() => {});
  }, [name]);

  const value = useMemo<Ctx>(
    () => ({
      theme: selectTheme(name),
      toggleTheme: () => setName((prev) => (prev === "dark" ? "light" : "dark")),
      setThemeName: (n: ThemeName) => setName(n),
    }),
    [name]
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
};

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export default ThemeProvider;

