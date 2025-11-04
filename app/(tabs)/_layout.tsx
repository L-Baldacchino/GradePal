// app/(tabs)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Pressable, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

export default function TabsLayout() {
  const { theme, toggleTheme } = useTheme();

  const headerRight = () => (
    <Pressable onPress={toggleTheme}>
      <View style={{ paddingHorizontal: 12 }}>
        <Ionicons
          name={theme.name === "dark" ? "sunny" : "moon"}
          size={22}
          color={theme.navText}
        />
      </View>
    </Pressable>
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarStyle: {
          backgroundColor: theme.navBg,
          borderTopColor: theme.border,
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        sceneContainerStyle: { backgroundColor: theme.bg },
        headerStyle: { backgroundColor: theme.navBg },
        headerTitleStyle: { color: theme.navText },
        headerTintColor: theme.navText,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
          headerRight,
        }}
      />
      <Tabs.Screen
        name="pomodoro"
        options={{
          title: "Pomodoro Timer",
          tabBarIcon: ({ color, size }) => <Ionicons name="timer" color={color} size={size} />,
          headerRight,
        }}
      />
      {/* NEW: Support tab */}
      <Tabs.Screen
        name="support"
        options={{
          title: "Support",
          tabBarIcon: ({ color, size }) => <Ionicons name="heart" color={color} size={size} />,
          headerRight,
        }}
      />
    </Tabs>
  );
}
