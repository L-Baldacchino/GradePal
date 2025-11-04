// app/(tabs)/index.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useNavigation } from "expo-router";
import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../theme/ThemeProvider";

type Subject = { code: string; name: string };
const SUBJECTS_KEY = "subjects:v1";

export default function HomeSubjects() {
  const { theme, toggleTheme } = useTheme();
  const nav = useNavigation();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  // Themed header (toggle on the right)
  useLayoutEffect(() => {
    nav.setOptions({
      headerStyle: { backgroundColor: theme.navBg },
      headerTintColor: theme.navText,
      headerTitleStyle: { color: theme.navText },
      headerRight: () => (
        <Pressable onPress={toggleTheme} style={{ paddingHorizontal: 12 }}>
          <Ionicons
            name={theme.name === "dark" ? "sunny" : "moon"}
            size={22}
            color={theme.navText}
          />
        </Pressable>
      ),
      title: "Subjects",
    });
  }, [nav, theme, toggleTheme]);

  // Load/save subjects
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SUBJECTS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setSubjects(parsed);
        }
      } catch {}
    })();
  }, []);
  useEffect(() => {
    AsyncStorage.setItem(SUBJECTS_KEY, JSON.stringify(subjects)).catch(() => {});
  }, [subjects]);

  function addSubject() {
    const c = code.trim().toUpperCase();
    const n = name.trim();
    if (!c) return Alert.alert("Subject code is required");
    if (!n) return Alert.alert("Subject name is required");
    if (subjects.some((s) => s.code === c)) return Alert.alert("That subject code already exists");
    setSubjects((prev) => [...prev, { code: c, name: n }]);
    setCode(""); setName("");
  }

  function removeSubject(c: string) {
    Alert.alert("Remove subject", `Delete ${c}? (Calculator data is kept)`, [
      { text: "Cancel" },
      { text: "Remove", style: "destructive", onPress: () => setSubjects((prev) => prev.filter((s) => s.code !== c)) },
    ]);
  }

  function openSubject(c: string) {
    router.push(`/grade-planner/${encodeURIComponent(c)}`);
  }

  const empty = useMemo(() => subjects.length === 0, [subjects]);
  const s = makeStyles(theme);

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.headerBox}>
        <Text style={s.sub}>Add your units, then tap to open each calculator.</Text>
      </View>

      {/* Add form */}
      <View style={s.formRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>Subject code</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="e.g. CSE3MAD"
            placeholderTextColor={theme.textMuted}
            style={s.input}
            autoCapitalize="characters"
          />
        </View>
        <View style={{ flex: 2 }}>
          <Text style={s.label}>Subject name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Mobile Application Development"
            placeholderTextColor={theme.textMuted}
            style={s.input}
          />
        </View>
        <Pressable onPress={addSubject} style={[s.btn, { backgroundColor: theme.primary }]}>
          <Text style={[s.btnText, { color: theme.primaryText }]}>Add</Text>
        </Pressable>
      </View>

      {/* List */}
      {empty ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyText}>No subjects yet. Add one above.</Text>
        </View>
      ) : (
        <FlatList
          data={subjects}
          keyExtractor={(i) => i.code}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => openSubject(item.code)} style={s.card}>
              <View style={{ flex: 1 }}>
                <Text style={s.code}>{item.code}</Text>
                <Text style={s.name}>{item.name}</Text>
              </View>
              <Pressable onPress={() => removeSubject(item.code)} style={[s.smallBtn, { backgroundColor: theme.border }]}>
                <Text style={s.smallBtnText}>Remove</Text>
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (t: ReturnType<typeof useTheme>["theme"]) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    headerBox: { paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: t.border, borderBottomWidth: 1, backgroundColor: t.bg },
    sub: { color: t.textMuted },

    formRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 16 },
    label: { color: t.textMuted, fontSize: 12, marginBottom: 4 },
    input: { color: t.text, borderColor: t.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: t.card },

    btn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, alignSelf: "flex-end" },
    btnText: { fontWeight: "700" },

    emptyBox: { margin: 16, borderColor: t.border, borderWidth: 1, borderRadius: 12, padding: 16, backgroundColor: t.card },
    emptyText: { color: t.textMuted },

    card: { flexDirection: "row", alignItems: "center", backgroundColor: t.card, borderColor: t.border, borderWidth: 1, borderRadius: 14, padding: 12 },
    code: { color: t.text, fontSize: 16, fontWeight: "700" },
    name: { color: t.textMuted, fontSize: 13, marginTop: 2 },

    smallBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginLeft: 12 },
    smallBtnText: { color: t.text },
  });
