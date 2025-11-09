// app/(tabs)/_layout.tsx

// Icons for the tab bar + header
import { Ionicons } from "@expo/vector-icons";
// Expo Router’s tab navigator
import { Tabs } from "expo-router";
// Basic UI bits + types for the style prop typing below
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
// Theme system so the app adapts to light/dark
import { useTheme } from "../../theme/ThemeProvider";

export default function TabsLayout() {
  const { theme, toggleTheme } = useTheme();

  // Small button on the top right of the header that toggles between light/dark theme
  const headerRight = () => (
    <Pressable onPress={toggleTheme}>
      <View style={{ paddingHorizontal: 12 }}>
        <Ionicons
          // Swap icons based on current theme
          name={theme.name === "dark" ? "sunny" : "moon"}
          size={22}
          color={theme.navText}
        />
      </View>
    </Pressable>
  );

  return (
    <Tabs
      // Put shared options here so both tabs inherit the same look/feel
      screenOptions={{
        // Keep the tab header visible
        headerShown: true,

        // Style of the bottom tab bar
        tabBarStyle: {
          backgroundColor: theme.navBg,
          borderTopColor: theme.border,
        },

        // Active/inactive tab icon colors
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,

        // Header appearance
        headerStyle: { backgroundColor: theme.navBg },
        headerTitleStyle: { color: theme.navText },
        headerTintColor: theme.navText,

        // Background for the actual screen area.
        // Typed as StyleProp<ViewStyle> to satisfy TS.
        sceneContainerStyle: [{ backgroundColor: theme.bg }] as StyleProp<ViewStyle>,
      }}
    >
      {/* -------------------------  
          HOME TAB
          ------------------------- */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) =>
            <Ionicons name="home" color={color} size={size} />,
          headerRight,
        }}
      />

      {/* -------------------------  
          POMODORO TIMER TAB
          ------------------------- */}
      <Tabs.Screen
        name="pomodoro"
        options={{
          title: "Pomodoro Timer",
          tabBarIcon: ({ color, size }) =>
            <Ionicons name="timer" color={color} size={size} />,
          headerRight,
        }}
      />

      {/* -------------------------  
          SUPPORT TAB
          ------------------------- */}
      <Tabs.Screen
        name="support"
        options={{
          title: "Support",
          tabBarIcon: ({ color, size }) =>
            <Ionicons name="heart" color={color} size={size} />,
          headerRight,
        }}
      />
    </Tabs>
  );
}
