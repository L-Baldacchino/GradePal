// app/(tabs)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useTheme } from "../theme/ThemeProvider";

export default function TabsLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        // Tab bar theming
        tabBarStyle: {
          backgroundColor: theme.navBg,
          borderTopColor: theme.border,
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: { fontWeight: "600" },

        // Page background behind each screen
        sceneContainerStyle: { backgroundColor: theme.bg },

        // Default header styling for tabs that keep a header
        headerStyle: { backgroundColor: theme.navBg },
        headerTintColor: theme.navText,
        headerTitleStyle: { color: theme.navText },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="pomodoro"
        options={{
          title: "Pomodoro",
          // Hide the native header (removes the white bar)
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="timer" color={color} size={size} />
          ),
        }}
      />

      {/* add other tabs here... */}
    </Tabs>
  );
}
