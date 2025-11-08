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

// ---------- helpers for email ----------
const enc = (v: string) => encodeURIComponent(v ?? "");

async function appInstalled(scheme: string) {
  try {
    return await Linking.canOpenURL(scheme);
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

async function openWithMailto(to: string, subject: string, body: string) {
  const url = `mailto:${to}?subject=${enc(subject)}&body=${enc(body)}`;
  try {
    const can = await Linking.canOpenURL(url);
    if (!can) return false;
    await Linking.openURL(url); // Android shows chooser if multiple mail apps exist
    return true;
  } catch {
    return false;
  }
}

export default function SupportScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  // ✅ Real app version from app.json (works in Expo Go/dev/prod)
  const appVersion =
    Constants.expoConfig?.version ||
    Constants.manifest?.version ||
    "1.0.0";

  const [feedback, setFeedback] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(`Feedback for Grade Pal v${appVersion}`);

  const body = useMemo(() => {
    const lines = [feedback.trim(), "", "—", `Contact: ${email.trim() || "N/A"}`];
    return lines.join("\n");
  }, [feedback, email]);

  const openCoffee = useCallback(async () => {
    try {
      const supported = await Linking.canOpenURL(BUY_ME_A_COFFEE_URL);
      if (supported) await Linking.openURL(BUY_ME_A_COFFEE_URL);
      else Alert.alert("Unable to open link", "Please try again later.");
    } catch {
      Alert.alert("Unable to open link", "Please try again later.");
    }
  }, []);

  const resetAllData = useCallback(() => {
    Alert.alert(
      "Reset All Data",
      "This will delete all saved subjects, grade planners, Pomodoro data, and theme preferences on this device. This cannot be undone.",
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

  const sendFeedback = useCallback(async () => {
    if (!feedback.trim()) {
      Alert.alert("Feedback empty", "Please write a short message first.");
      return;
    }

    // 1) Try standard mailto (chooser on Android if multiple apps exist)
    const viaMailto = await openWithMailto(FEEDBACK_EMAIL, subject.trim(), body);
    if (viaMailto) return;

    // 2) Manual choices
    const hasGmail = await appInstalled("googlegmail://");
    const hasOutlook = await appInstalled("ms-outlook://");

    const options: { text: string; onPress: () => void }[] = [];

    if (hasGmail) {
      options.push({
        text: "Gmail",
        onPress: async () => {
          const ok = await openWithGmail(FEEDBACK_EMAIL, subject.trim(), body);
          if (!ok) Alert.alert("Could not open Gmail", "Try Outlook or another mail app.");
        },
      });
    }

    if (hasOutlook) {
      options.push({
        text: "Outlook",
        onPress: async () => {
          const ok = await openWithOutlook(FEEDBACK_EMAIL, subject.trim(), body);
          if (!ok) Alert.alert("Could not open Outlook", "Try Gmail or another mail app.");
        },
      });
    }

    options.push({
      text: Platform.OS === "android" ? "System chooser" : "Default Mail",
      onPress: async () => {
        const ok = await openWithMailto(FEEDBACK_EMAIL, subject.trim(), body);
        if (!ok) Alert.alert("No email app available", `Please email ${FEEDBACK_EMAIL} using your preferred client.`);
      },
    });

    if (!hasGmail && !hasOutlook) {
      Alert.alert("No email app available", `Please email ${FEEDBACK_EMAIL} using your preferred client.`);
      return;
    }

    Alert.alert("Send feedback with…", "Choose an app:", [...options, { text: "Cancel", style: "cancel" }]);
  }, [feedback, subject, body]);

  return (
    <SafeAreaView style={[s.screen]} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.select({ ios: 0, android: 0 })} // stack header hidden, so zero offset
      >
        <ScrollView
          style={{ flex: 1 }}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        >
          {/* Why I built this */}
          <View style={s.card}>
            <Text style={s.title}>Why I built this</Text>
            <Text style={s.body}>
              I started this app to make it effortless for uni students to see exactly what percentage they need to pass
              a subject. Add your own assessments, track grades, and instantly see your accumulated result. It’s
              lightweight, distraction-free, and built to help when you need it most.
            </Text>
          </View>

          {/* Support the project */}
          <View style={s.card}>
            <Text style={s.title}>Support the project</Text>
            <Text style={s.body}>
              If this app helped you, you can buy me a coffee. Your support keeps the project alive and encourages new
              features. Please note that this is entirely optional, the app will always be free to use.
            </Text>

            <Pressable onPress={openCoffee} style={[s.ctaBtn, { backgroundColor: theme.primary }]}>
              <Ionicons name="cafe" size={18} color={theme.primaryText} />
              <Text style={[s.ctaText, { color: theme.primaryText }]}>Buy me a coffee</Text>
            </Pressable>
          </View>

          {/* Feedback */}
          <View style={s.card}>
            <Text style={s.title}>Send feedback</Text>
            <Text style={s.body}>Found a bug, have an idea, or just want to say thanks? I’d love to hear it.</Text>

            <Text style={s.label}>Subject</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder={`Feedback for Grade Pal v${appVersion}`}
              placeholderTextColor={theme.textMuted}
              style={s.input}
              returnKeyType="next"
            />

            <Text style={[s.label, { marginTop: 10 }]}>Your email (optional)</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@uni.edu.au"
              placeholderTextColor={theme.textMuted}
              style={s.input}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />

            <Text style={[s.label, { marginTop: 10 }]}>Message</Text>
            <TextInput
              value={feedback}
              onChangeText={setFeedback}
              placeholder="Write your feedback here…"
              placeholderTextColor={theme.textMuted}
              style={[s.input, s.textarea]}
              multiline
              textAlignVertical="top"
            />

            <Pressable
              onPress={sendFeedback}
              style={[s.ctaBtn, { backgroundColor: theme.primary, marginTop: 12 }]}
              disabled={!feedback.trim()}
            >
              <Ionicons name="mail" size={18} color={theme.primaryText} />
              <Text style={[s.ctaText, { color: theme.primaryText }]}>Send feedback</Text>
            </Pressable>
          </View>

          {/* Danger zone */}
          <View style={s.card}>
            <Text style={s.title}>Danger zone</Text>
            <Text style={s.body}>
              Need a fresh start? This removes all subjects, per-subject grade planners, Pomodoro data, and theme
              preferences stored on this device.
            </Text>
            <Pressable onPress={resetAllData} style={s.dangerBtn}>
              <Ionicons name="trash" size={18} color="#fff" />
              <Text style={s.dangerText}>Reset all data</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {/* Bottom inset safe area (keeps content away from home indicator on iOS) */}
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: theme.bg }} />
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
    textarea: {
      minHeight: 120,
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
