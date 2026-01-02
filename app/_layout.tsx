// app/_layout.tsx

// The top-level navigator for the entire app.
// Expo Router’s <Stack> controls which screens show headers, transitions, etc.
import { Stack } from "expo-router";
import React from "react";

// Provides safe area insets (status bar, notches, home indicator)
import { SafeAreaProvider } from "react-native-safe-area-context";

// Gesture handler root required for DraggableFlatList and other gestures
import { GestureHandlerRootView } from "react-native-gesture-handler";

// App-wide theme context (colors, typography, light/dark toggle)
import { View } from "react-native";
import ThemeProvider, { useTheme } from "../theme/ThemeProvider";

/**
 * Inner navigator so we can use the theme inside the Stack
 * (to set background colour and animation styles).
 */
function RootNavigator() {
  const { theme } = useTheme();

  return (
    // 🔑 This view ensures the *whole* navigator area uses theme.bg,
    // so you don’t see white behind cards during transitions.
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Stack
        screenOptions={{
          // Use app background during transitions instead of default white
          contentStyle: { backgroundColor: theme.bg },

          // Simple slide animation between pages
          animation: "slide_from_right",
          // Note: native-stack often ignores this prop, so don’t stress if
          // it doesn’t change much.
          // animationDuration: 100,
        }}
      >
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
    </View>
  );
}

export default function RootLayout() {
  return (
    // 🔑 Gesture handler must wrap the *entire* app tree
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Wrap the whole app to respect safe areas on iOS/Android */}
      <SafeAreaProvider>
        {/* Make theme (light/dark + palette) available everywhere */}
        <ThemeProvider>
          {/* Root navigator that uses theme-aware background & animations */}
          <RootNavigator />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
