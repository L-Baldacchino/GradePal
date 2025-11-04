// app/(tabs)/support.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useState } from "react";
import {
    Alert,
    Linking,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

const BUY_ME_A_COFFEE_URL = "https://www.buymeacoffee.com/teraau"; // ← replace with your link
const FEEDBACK_EMAIL = "terabadau@gmail.com"; // ← replace with your email

export default function SupportScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [feedback, setFeedback] = useState("");
  const [email, setEmail] = useState("");

  const openCoffee = async () => {
    const supported = await Linking.canOpenURL(BUY_ME_A_COFFEE_URL);
    if (supported) Linking.openURL(BUY_ME_A_COFFEE_URL);
    else Alert.alert("Unable to open link", "Please try again later.");
  };

  const resetAllData = () => {
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
              // Force remount so screens reload fresh state
              router.replace("/");
            } catch (e) {
              Alert.alert("Error", "Something went wrong clearing data.");
            }
          },
        },
      ]
    );
  };

  const sendFeedback = async () => {
    if (!feedback.trim()) {
      Alert.alert("Feedback empty", "Please write a short message first.");
      return;
    }
    // Build mailto link with subject/body
    const subject = encodeURIComponent("Feedback for Uni Grade Planner");
    const bodyLines = [
      feedback.trim(),
      "",
      "—",
      `Contact: ${email.trim() || "N/A"}`,
    ];
    const body = encodeURIComponent(bodyLines.join("\n"));
    const url = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;

    const can = await Linking.canOpenURL(url);
    if (can) Linking.openURL(url);
    else Alert.alert("No email app available", "Please send an email to " + FEEDBACK_EMAIL);
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 16 }}>
      {/* Why I built this */}
      <View style={s.card}>
        <Text style={s.title}>Why I built this</Text>
        <Text style={s.body}>
          I started this app to make it effortless for uni students to see
          exactly what percentage they need to pass a subject. Add your own
          assessments, track grades, and instantly see your accumulated
          result. It’s lightweight, distraction-free, and built to help when
          you need it most.
        </Text>
      </View>

      {/* Support the project */}
      <View style={s.card}>
        <Text style={s.title}>Support the project</Text>
        <Text style={s.body}>
          If this app helped you, you can buy me a coffee. Your support keeps
          the project alive and encourages new features.
        </Text>

        <Pressable onPress={openCoffee} style={[s.ctaBtn, { backgroundColor: theme.primary }]}>
          <Ionicons name="cafe" size={18} color={theme.primaryText} />
          <Text style={[s.ctaText, { color: theme.primaryText }]}>Buy me a coffee</Text>
        </Pressable>
      </View>

      {/* Feedback */}
      <View style={s.card}>
        <Text style={s.title}>Send feedback</Text>
        <Text style={s.body}>
          Found a bug, have an idea, or just want to say thanks? I’d love to hear it.
        </Text>

        <Text style={s.label}>Your email (optional)</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@uni.edu.au"
          placeholderTextColor={theme.textMuted}
          style={s.input}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
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

        <Pressable onPress={sendFeedback} style={[s.ctaBtn, { backgroundColor: theme.primary, marginTop: 12 }]}>
          <Ionicons name="mail" size={18} color={theme.primaryText} />
          <Text style={[s.ctaText, { color: theme.primaryText }]}>Send feedback</Text>
        </Pressable>
      </View>

      {/* Danger zone */}
      <View style={s.card}>
        <Text style={s.title}>Danger zone</Text>
        <Text style={s.body}>
          Need a fresh start? This removes all subjects, per-subject grade planners,
          Pomodoro data, and theme preferences stored on this device.
        </Text>
        <Pressable onPress={resetAllData} style={s.dangerBtn}>
          <Ionicons name="trash" size={18} color="#fff" />
          <Text style={s.dangerText}>Reset all data</Text>
        </Pressable>
      </View>
    </ScrollView>
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
