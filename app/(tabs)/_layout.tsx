// app/(tabs)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useTheme } from "../theme/ThemeProvider";

export default function TabsLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: theme.navBg,
          borderTopColor: theme.border,
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: { fontWeight: "600" },
        sceneContainerStyle: { backgroundColor: theme.bg },
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
          headerShown: false, // hide native header (we render our own)
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="timer" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
