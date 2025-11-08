// app/_layout.tsx

// The top-level navigator for the entire app.
// Expo Router’s <Stack> controls which screens show headers, transitions, etc.
import { Stack } from "expo-router";
import React from "react";

// Provides safe area insets (status bar, notches, home indicator)
import { SafeAreaProvider } from "react-native-safe-area-context";

// App-wide theme context (colors, typography, light/dark toggle)
import ThemeProvider from "../theme/ThemeProvider";

export default function RootLayout() {
  return (
    // Wrap the whole app to respect safe areas on iOS/Android
    <SafeAreaProvider>
      {/* Make theme (light/dark + palette) available everywhere */}
      <ThemeProvider>
        {/* Stack is the root navigator. Tabs and other screens live under here. */}
        <Stack>
          {/* (tabs) group: the bottom tab bar flows from here.
              We hide the header because each tab screen defines its own header. */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

          {/* Subject planner screen (e.g., /grade-planner/CSE3MAD).
              This keeps a visible header; the actual title is set at runtime
              by the page based on the subject code. */}
          <Stack.Screen
            name="grade-planner/[subject]"
            options={{
              headerShown: true,
              title: "Subject", // gets overridden in the screen with nav.setOptions(...)
            }}
          />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
