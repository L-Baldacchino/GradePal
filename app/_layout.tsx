// app/_layout.tsx
import { Stack } from "expo-router";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ThemeProvider from "../theme/ThemeProvider";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Stack>
          {/* Hide header for the (tabs) group only */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

          {/* Keep header for pages like grade-planner/[subject] */}
          <Stack.Screen
            name="grade-planner/[subject]"
            options={{
              headerShown: true,
              title: "Subject", // this will be replaced dynamically
            }}
          />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
