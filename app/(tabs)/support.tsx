// app/(tabs)/support.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeProvider";

const BUY_ME_A_COFFEE_URL = "https://www.buymeacoffee.com/teraau";
const FEEDBACK_EMAIL = "terabadau@gmail.com";
const DISCORD_URL = "https://discord.gg/fvTgWbE6";
const GITHUB_URL = "https://github.com/L-Baldacchino/GradePal";

// ---------- helpers ----------
const enc = (v: string) => encodeURIComponent(v ?? "");

async function appInstalled(scheme: string) {
  try {
    return await Linking.canOpenURL(scheme);
  } catch {
    return false;
  }
}

async function openWithMailto(to: string, subject: string, body: string) {
  const url = `mailto:${to}?subject=${enc(subject)}&body=${enc(body)}`;
  try {
    const can = await Linking.canOpenURL(url);
    if (!can) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

async function openWithGmail(to: string, subject: string, body: string) {
  if (!(await appInstalled("googlegmail://"))) return false;
  const url = `googlegmail://co?to=${enc(to)}&subject=${enc(subject)}&body=${enc(body)}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

async function openWithOutlook(to: string, subject: string, body: string) {
  if (!(await appInstalled("ms-outlook://"))) return false;
  const url = `ms-outlook://compose?to=${enc(to)}&subject=${enc(subject)}&body=${enc(body)}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export default function SupportScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const appVersion =
    Constants.expoConfig?.version ||
    Constants.manifest?.version ||
    "1.0.0";

  const [feedback, setFeedback] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(`Feedback for Grade Pal v${appVersion}`);

  const body = useMemo(
    () => [feedback.trim(), "", "—", `Contact: ${email.trim() || "N/A"}`].join("\n"),
    [feedback, email]
  );

  const openLink = async (url: string) => {
    const supported = await Linking.canOpenURL(url);
    if (supported) Linking.openURL(url);
    else Alert.alert("Unable to open link", "Please try again later.");
  };

  const sendFeedback = useCallback(async () => {
    if (!feedback.trim()) {
      Alert.alert("Feedback empty", "Please write a short message first.");
      return;
    }

    const viaMailto = await openWithMailto(FEEDBACK_EMAIL, subject.trim(), body);
    if (viaMailto) return;

    const hasGmail = await appInstalled("googlegmail://");
    const hasOutlook = await appInstalled("ms-outlook://");

    const options: { text: string; onPress: () => void }[] = [];

    if (hasGmail) {
      options.push({
        text: "Gmail",
        onPress: async () => {
          const ok = await openWithGmail(FEEDBACK_EMAIL, subject.trim(), body);
          if (!ok) Alert.alert("Could not open Gmail");
        },
      });
    }

    if (hasOutlook) {
      options.push({
        text: "Outlook",
        onPress: async () => {
          const ok = await openWithOutlook(FEEDBACK_EMAIL, subject.trim(), body);
          if (!ok) Alert.alert("Could not open Outlook");
        },
      });
    }

    options.push({
      text: Platform.OS === "android" ? "System chooser" : "Default Mail",
      onPress: async () => {
        const ok = await openWithMailto(FEEDBACK_EMAIL, subject.trim(), body);
        if (!ok) Alert.alert("No email app available");
      },
    });

    Alert.alert("Send feedback with…", "Choose an app:", [...options, { text: "Cancel", style: "cancel" }]);
  }, [feedback, subject, body]);

  const resetAllData = useCallback(() => {
    Alert.alert(
      "Reset All Data",
      "This will delete all subjects, Pomodoro logs, and settings. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              await AsyncStorage.clear();
              Alert.alert("Data reset", "All app data cleared.");
              router.replace("/");
            } catch {
              Alert.alert("Error", "Could not clear data");
            }
          },
        },
      ]
    );
  }, []);

  return (
    <SafeAreaView style={[s.screen]} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        >
          {/* ✅ 1. Why I built this */}
          <View style={s.card}>
            <Text style={s.title}>Why I built this</Text>
            <Text style={s.body}>
              I built this app to help uni students understand exactly what they
              need to pass a subject—quickly, clearly, and without stress.
            </Text>
          </View>

          {/* ✅ 2. Discord */}
          <View style={s.card}>
            <Text style={s.title}>Join the community</Text>
            <Text style={s.body}>
              Join the Tera Apps Community Discord to get updates, request
              features, report bugs, and connect with other students.
            </Text>

            <Pressable
              onPress={() => openLink(DISCORD_URL)}
              style={[s.ctaBtn, { backgroundColor: "#5865F2" }]}
            >
              <Ionicons name="logo-discord" size={20} color="#fff" />
              <Text style={[s.ctaText, { color: "#fff" }]}>Join Discord</Text>
            </Pressable>
          </View>

          {/* ✅ 3. GitHub */}
          <View style={s.card}>
            <Text style={s.title}>GitHub Repository</Text>
            <Text style={s.body}>
              Want to report an issue or view the project source code? Visit the
              official GitHub repository.
            </Text>

            <Pressable
              onPress={() => openLink(GITHUB_URL)}
              style={[s.ctaBtn, { backgroundColor: "#24292F" }]}
            >
              <Ionicons name="logo-github" size={20} color="#fff" />
              <Text style={[s.ctaText, { color: "#fff" }]}>View on GitHub</Text>
            </Pressable>
          </View>

          {/* ✅ 4. Support the project */}
          <View style={s.card}>
            <Text style={s.title}>Support the project</Text>
            <Text style={s.body}>
              If the app helped you, consider buying me a coffee. It keeps the
              project alive and supports future development.
            </Text>

            <Pressable
              onPress={() => openLink(BUY_ME_A_COFFEE_URL)}
              style={[s.ctaBtn, { backgroundColor: theme.primary }]}
            >
              <Ionicons name="cafe" size={18} color={theme.primaryText} />
              <Text style={[s.ctaText, { color: theme.primaryText }]}>
                Buy me a coffee
              </Text>
            </Pressable>
          </View>

          {/* ✅ 5. Feedback */}
          <View style={s.card}>
            <Text style={s.title}>Send feedback</Text>

            <Text style={s.label}>Subject</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              style={s.input}
              placeholder={`Feedback for Grade Pal v${appVersion}`}
              placeholderTextColor={theme.textMuted}
            />

            <Text style={s.label}>Your email (optional)</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              style={s.input}
              placeholder="you@uni.edu.au"
              placeholderTextColor={theme.textMuted}
              keyboardType="email-address"
            />

            <Text style={s.label}>Message</Text>
            <TextInput
              value={feedback}
              onChangeText={setFeedback}
              style={[s.input, s.textarea]}
              placeholder="Write your feedback here…"
              placeholderTextColor={theme.textMuted}
              multiline
            />

            <Pressable
              onPress={sendFeedback}
              style={[s.ctaBtn, { backgroundColor: theme.primary, marginTop: 12 }]}
              disabled={!feedback.trim()}
            >
              <Ionicons name="mail" size={18} color={theme.primaryText} />
              <Text style={[s.ctaText, { color: theme.primaryText }]}>
                Send feedback
              </Text>
            </Pressable>
          </View>

          {/* ✅ 6. Danger zone */}
          <View style={s.card}>
            <Text style={s.title}>Danger zone</Text>
            <Text style={s.body}>
              This will remove all saved data including your subjects, grade
              planners, Pomodoro logs, and settings.
            </Text>

            <Pressable onPress={resetAllData} style={s.dangerBtn}>
              <Ionicons name="trash" size={18} color="#fff" />
              <Text style={s.dangerText}>Reset all data</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    label: { color: t.textMuted, fontSize: 12, marginTop: 6, marginBottom: 4 },
    input: {
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      color: t.text,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
    },
    textarea: { minHeight: 120 },
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
    dangerText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 15,
    },
  });
