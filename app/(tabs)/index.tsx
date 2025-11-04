// app/(tabs)/index.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

type Subject = {
  code: string;
  name: string;
};

const STORAGE_KEY = "subjects-list:v1";

export default function SubjectsScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  // Load saved subjects
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) setSubjects(JSON.parse(saved));
      } catch {}
    })();
  }, []);

  // Save on change
  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(subjects)).catch(() => {});
  }, [subjects]);

  const addSubject = () => {
    if (!code.trim() || !name.trim()) {
      Alert.alert("Missing info", "Please enter both code and name.");
      return;
    }

    const exists = subjects.some((s) => s.code.toUpperCase() === code.trim().toUpperCase());
    if (exists) {
      Alert.alert("Duplicate", "This subject code already exists.");
      return;
    }

    const newSub: Subject = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
    };

    setSubjects((prev) => [...prev, newSub]);
    setCode("");
    setName("");
  };

  const removeSubject = (code: string) => {
    Alert.alert("Remove Subject", `Are you sure you want to remove ${code}?`, [
      { text: "Cancel" },
      { text: "Remove", style: "destructive", onPress: () => setSubjects((prev) => prev.filter((s) => s.code !== code)) },
    ]);
  };

  return (
    <View style={[s.screen]}>
      <Text style={s.title}>Subjects</Text>
      <Text style={s.subtitle}>Add your units, then tap to open each calculator.</Text>

      <View style={s.divider} />

      {/* Input Fields */}
      <View style={s.row}>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="e.g. CSE3MAD"
          placeholderTextColor={theme.textMuted}
          style={[s.inputCompact, { flexBasis: 130 }]}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Mobile Application Development"
          placeholderTextColor={theme.textMuted}
          style={[s.inputCompact, { flex: 1 }]}
          autoCapitalize="words"
          autoCorrect={false}
        />
        <Pressable onPress={addSubject} style={[s.primaryBtn, { backgroundColor: theme.primary }]}>
          <Text style={[s.primaryBtnText, { color: theme.primaryText }]}>Add</Text>
        </Pressable>
      </View>

      {/* Subject List */}
      <FlatList
        data={subjects}
        keyExtractor={(item) => item.code}
        contentContainerStyle={{ paddingBottom: 60 }}
        renderItem={({ item }) => (
          <View style={s.subjectCard}>
            <Link
              href={`/grade-planner/${encodeURIComponent(item.code)}`}
              style={{ flex: 1 }}
            >
              <Text>
                <Text style={s.subjectCode}>{item.code}</Text>
                <Text style={s.subjectName}> – {item.name}</Text>
              </Text>
            </Link>

            <Pressable onPress={() => removeSubject(item.code)} style={s.removeBtn}>
              <Text style={s.removeBtnText}>Remove</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const makeStyles = (t: any) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: t.bg,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    title: {
      color: t.text,
      fontSize: 22,
      fontWeight: "700",
      marginBottom: 4,
    },
    subtitle: {
      color: t.textMuted,
      fontSize: 13,
      marginBottom: 12,
    },
    divider: {
      height: 1,
      backgroundColor: t.border,
      marginBottom: 12,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 18,
    },
    inputCompact: {
      minHeight: 48,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
      color: t.text,
      fontSize: 14,
      flexShrink: 1,
    },
    subjectCard: {
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
      flexDirection: "row",
      alignItems: "center",
    },
    subjectCode: {
      color: t.text,
      fontWeight: "700",
      fontSize: 15,
    },
    subjectName: {
      color: t.textMuted,
      fontSize: 15,
      fontWeight: "400",
    },
    removeBtn: {
      backgroundColor: t.border,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 14,
      marginLeft: 10,
    },
    removeBtnText: {
      color: t.text,
      fontSize: 13,
      fontWeight: "600",
    },
    primaryBtn: {
      height: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    primaryBtnText: {
      fontSize: 14,
      fontWeight: "700",
    },
  });
