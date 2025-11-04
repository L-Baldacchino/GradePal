// app/_layout.tsx
import { Stack } from "expo-router";
import { ThemeProvider, useTheme } from "./theme/ThemeProvider";

function ThemedStack() {
  const { theme } = useTheme();

  // Apply themed headers
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: theme.navBg },
        headerTintColor: theme.navText,
        headerTitleStyle: { color: theme.navText },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="grade-planner/[subject]" options={{ title: "Grade Planner" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ThemedStack />
    </ThemeProvider>
  );
}
