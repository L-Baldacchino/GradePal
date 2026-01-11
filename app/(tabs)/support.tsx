// app/(tabs)/support.tsx

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useMemo } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeProvider";

/** External links */
const BUY_ME_A_COFFEE_URL = "https://www.buymeacoffee.com/teraau";

/** Open links reliably on Android/iOS: in-app browser first, then fallback */
async function safeOpenUrl(url: string) {
  try {
    const result = await WebBrowser.openBrowserAsync(url, {
      enableDefaultShareMenuItem: true,
      showTitle: true,
      createTask: Platform.OS === "android",
    });

    if (result.type === "dismiss" || result.type === "cancel") {
      await Linking.openURL(url);
    }
  } catch {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Unable to open link", "Please try again later.");
    }
  }
}

/** Safer version getter for modern Expo/EAS builds */
function getAppVersion(): string {
  // expoConfig is the modern typed config
  const v1 = Constants.expoConfig?.version;

  // expoConfig2 exists in newer builds; TS might not know it depending on types,
  // so we access it safely via `as any`
  const v2 = (Constants as any)?.expoConfig2?.version as string | undefined;

  return v1 || v2 || "1.0.0";
}

export default function SupportScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const appVersion = useMemo(() => getAppVersion(), []);

  const openCoffee = useCallback(() => safeOpenUrl(BUY_ME_A_COFFEE_URL), []);

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
    <SafeAreaView style={[s.screen]} edges={["top", "left", "right"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.card}>
          <Text style={s.title}>Why I built this</Text>
          <Text style={s.body}>
            Grade Pal helps uni students quickly see the percentage they need
            to pass a subject, without spreadsheets or stress.{"\n\n"}
            Add your own assessments, track grades, and instantly see your
            accumulated result. It’s simple, fast, and built for ease.{"\n\n"}
            As a uni student myself, I built Grade Pal to solve my own
            struggles with tracking grades, and understanding what % I need for
            a final exam. I hope it helps you too!{"\n\n"}
            Luke Baldacchino{"\n"}
            Creator – Grade Pal{"\n"}❤️
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.title}>Support the project</Text>
          <Text style={s.body}>
            If Grade Pal helped you, you can buy me a coffee. Your support helps
            keep the app free and funds future improvements.
          </Text>

          <Pressable
            onPress={openCoffee}
            style={[s.ctaBtn, { backgroundColor: theme.primary }]}
          >
            <Ionicons name="cafe" size={18} color={theme.primaryText} />
            <Text style={[s.ctaText, { color: theme.primaryText }]}>
              Buy me a coffee
            </Text>
          </Pressable>
        </View>

        <View style={s.card}>
          <Text style={s.title}>Privacy & Data</Text>
          <Text style={s.body}>
            Your data stays on your device. Grade Pal is designed to be simple,
            transparent, and student-friendly:
          </Text>

          <View style={s.bulletList}>
            <View style={s.bulletRow}>
              <Text style={s.bulletDot}>•</Text>
              <Text style={s.body}>No tracking or analytics</Text>
            </View>
            <View style={s.bulletRow}>
              <Text style={s.bulletDot}>•</Text>
              <Text style={s.body}>No account or login required</Text>
            </View>
            <View style={s.bulletRow}>
              <Text style={s.bulletDot}>•</Text>
              <Text style={s.body}>All subjects and grades are stored locally</Text>
            </View>
            <View style={s.bulletRow}>
              <Text style={s.bulletDot}>•</Text>
              <Text style={s.body}>
                You can delete all data at any time from this screen
              </Text>
            </View>
          </View>

          <Text style={[s.body, { marginTop: 8, opacity: 0.8 }]}>
            Nothing is sent to a server, everything lives on your phone.
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.title}>Disclaimer</Text>
          <Text style={s.body}>
            Grade Pal aims to help students better understand their progress
            across assessments, however all results are estimates only. Final
            grades, assessment policies, and hurdle outcomes are determined by
            your university. If you are unsure about your standing in a subject,
            please contact your lecturer or course coordinator.
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.title}>Danger zone</Text>
          <Text style={s.body}>
            Need a fresh start? This removes all subjects, per-subject grade
            planners, Pomodoro logs, and theme preferences stored on this
            device.
          </Text>

          <Pressable onPress={resetAllData} style={s.dangerBtn}>
            <Ionicons name="trash" size={18} color="#fff" />
            <Text style={s.dangerText}>Reset all data</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 12, alignItems: "center", opacity: 0.6 }}>
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>
            Version {appVersion}
          </Text>
        </View>
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={{ backgroundColor: theme.bg }} />
    </SafeAreaView>
  );
}

const makeStyles = (t: any) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },

    card: {
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
    },

    title: { color: t.text, fontSize: 18, fontWeight: "700", marginBottom: 6 },
    body: { color: t.text, fontSize: 14, lineHeight: 20, opacity: 0.9 },

    bulletList: { marginTop: 8, marginLeft: 4 },
    bulletRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 4,
    },
    bulletDot: {
      color: t.text,
      fontSize: 14,
      marginRight: 6,
      lineHeight: 20,
    },

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
