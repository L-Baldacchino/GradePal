// app/(tabs)/support.tsx

// Icons from Expo's Ionicons set for buttons and labels
import { Ionicons } from "@expo/vector-icons";
// Local storage used for clearing all app data in the "Danger zone"
import AsyncStorage from "@react-native-async-storage/async-storage";
// Expo Router to navigate back to root after a reset
import { router } from "expo-router";
// In-app browser for reliable external link handling on Android/iOS
import * as WebBrowser from "expo-web-browser";
import React, { useCallback } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
// Safe area to keep content out of notches and system UI
import { SafeAreaView } from "react-native-safe-area-context";
// Theme hook (colors, backgrounds, etc.) shared across the app
import { useTheme } from "../../theme/ThemeProvider";
// Access version number from app.json / app.config.js
import Constants from "expo-constants";

/** External links */
// Discord invite (feedback & community live here)
const DISCORD_URL = "https://discord.gg/fvTgWbE6"; // Tera Apps Community invite
// Public repo link for users to browse the code or report issues on GitHub
const GITHUB_URL = "https://github.com/L-Baldacchino/GradePal";
// Small donation link to support development
const BUY_ME_A_COFFEE_URL = "https://www.buymeacoffee.com/teraau";

/** Open links reliably on Android/iOS: in-app browser first, then fallback
 *  Why: Some Android ROMs return false for canOpenURL on https links or have no default browser set.
 *  This opens a Chrome Custom Tab / SFSafariViewController first. If the user dismisses it,
 *  we fall back to the system Linking API.
 */
async function safeOpenUrl(url: string) {
  try {
    const result = await WebBrowser.openBrowserAsync(url, {
      enableDefaultShareMenuItem: true,
      showTitle: true,
      createTask: Platform.OS === "android",
    });
    // If user dismissed the in-app browser, try handing it off to the system
    if (result.type === "dismiss" || result.type === "cancel") {
      await Linking.openURL(url);
    }
  } catch {
    // Final fallback: try system open; if that fails, show a friendly alert
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Unable to open link", "Please try again later.");
    }
  }
}

export default function SupportScreen() {
  // Grab theme colors and build styles from them
  const { theme } = useTheme();
  const s = makeStyles(theme);

  // Extract app version number displayed at bottom of this page
  const appVersion =
    Constants.expoConfig?.version ||
    Constants.manifest?.version ||
    "1.0.0";

  // Button handlers for external links
  const openDiscord = useCallback(() => safeOpenUrl(DISCORD_URL), []);
  const openGithub = useCallback(() => safeOpenUrl(GITHUB_URL), []);
  const openCoffee = useCallback(() => safeOpenUrl(BUY_ME_A_COFFEE_URL), []);

  // Clears all locally stored data and sends the user back to the root
  const resetAllData = useCallback(() => {
    Alert.alert(
      "Reset All Data",
      "This will delete all subjects, per-subject grade planners, Pomodoro logs, and theme settings on this device. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              await AsyncStorage.clear();
              Alert.alert("Data reset", "All app data has been cleared.");
              router.replace("/");
            } catch {
              Alert.alert("Error", "Something went wrong clearing data.");
            }
          },
        },
      ]
    );
  }, []);

  return (
    // Top/left/right safe areas so the content isn't under the notch or status bar
    <SafeAreaView style={[s.screen]} edges={["top", "left", "right"]}>
      {/* Scrollable content – keeps the page usable on smaller screens */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1) Why I built this
            Brief background so users understand the purpose and intent of the app. */}
        <View style={s.card}>
          <Text style={s.title}>Why I built this</Text>
          <Text style={s.body}>
            Grade Pal helps uni students quickly see the percentage they need to pass a subject —
            without spreadsheets or stress. Add your own assessments, track grades, and instantly
            see your accumulated result. It’s simple, fast, and built for focus.
            {"\n\n"}As a uni student myself, I built Grade Pal to solve my own struggles with tracking grades, 
            and understanding what % I need for a final exam. I hope it helps you too!
            {"\n\n"}Luke Baldacchino {"\n"}Creator - Grade Pal{"\n"}❤️
          </Text>
        </View>

        {/* 2) Discord
            All feedback and support are centralized here. The app uses Discord as the only feedback channel. */}
        <View style={s.card}>
          <Text style={s.title}>Join the community (Feedback & Support)</Text>
          <Text style={s.body}>
            All feedback, feature requests, and support are handled in the{" "}
            <Text style={{ fontWeight: "700" }}>Tera Apps Community</Text> Discord. Join to stay
            updated and chat with other students.
          </Text>

          <Pressable onPress={openDiscord} style={[s.ctaBtn, { backgroundColor: "#5865F2" }]}>
            <Ionicons name="logo-discord" size={20} color="#fff" />
            <Text style={[s.ctaText, { color: "#fff" }]}>Join Discord</Text>
          </Pressable>
        </View>

        {/* 3) GitHub
            Link to the public repository for transparency and issue tracking. */}
        <View style={s.card}>
          <Text style={s.title}>GitHub Repository</Text>
          <Text style={s.body}>
            Want to view the source code, star the project, or download via GitHub?
            You’ll find everything here.
          </Text>

          <Pressable onPress={openGithub} style={[s.ctaBtn, { backgroundColor: "#24292F" }]}>
            <Ionicons name="logo-github" size={20} color="#fff" />
            <Text style={[s.ctaText, { color: "#fff" }]}>View on GitHub</Text>
          </Pressable>
        </View>

        {/* 4) Support the project
            Optional donations – keeps the app free and helps future development. */}
        <View style={s.card}>
          <Text style={s.title}>Support the project</Text>
          <Text style={s.body}>
            If Grade Pal helped you, you can buy me a coffee. Your support helps keep the app free
            and funds future improvements.
          </Text>

          <Pressable onPress={openCoffee} style={[s.ctaBtn, { backgroundColor: theme.primary }]}>
            <Ionicons name="cafe" size={18} color={theme.primaryText} />
            <Text style={[s.ctaText, { color: theme.primaryText }]}>Buy me a coffee</Text>
          </Pressable>
        </View>

        {/* 5) Danger zone
            One-tap reset to clear everything on this device. Shows a confirmation first. */}
        <View style={s.card}>
          <Text style={s.title}>Danger zone</Text>
          <Text style={s.body}>
            Need a fresh start? This removes all subjects, per-subject grade planners, Pomodoro logs,
            and theme preferences stored on this device. Please refresh the app to see the changes.
          </Text>

          <Pressable onPress={resetAllData} style={s.dangerBtn}>
            <Ionicons name="trash" size={18} color="#fff" />
            <Text style={s.dangerText}>Reset all data</Text>
          </Pressable>
        </View>

        {/* ✅ 6) App version label
            Simple, small footer text so users know what version they're running. */}
        <View style={{ marginTop: 12, alignItems: "center", opacity: 0.6 }}>
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>
            Version {appVersion}
          </Text>
        </View>
      </ScrollView>

      {/* Bottom safe area so content doesn't clash with the home indicator / gesture bar */}
      <SafeAreaView edges={["bottom"]} style={{ backgroundColor: theme.bg }} />
    </SafeAreaView>
  );
}

/* ---------- styles ----------
   These are theme-aware styles. Colors come from ThemeProvider so
   light/dark palettes stay consistent across the app. */
const makeStyles = (t: any) =>
  StyleSheet.create({
    // Screen background
    screen: { flex: 1, backgroundColor: t.bg },

    // Card container for each section on the page
    card: {
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
    },

    // Card title text
    title: { color: t.text, fontSize: 18, fontWeight: "700", marginBottom: 6 },

    // Body copy (comfortable line height, slightly softened)
    body: { color: t.text, fontSize: 14, lineHeight: 20, opacity: 0.9 },

    // Primary call-to-action button
    ctaBtn: {
      marginTop: 12,
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
    },
    ctaText: { fontWeight: "700", fontSize: 15 },

    // Destructive action button (reset all data)
    dangerBtn: {
      marginTop: 12,
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      backgroundColor: "#E25563",
    },
    dangerText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  });
