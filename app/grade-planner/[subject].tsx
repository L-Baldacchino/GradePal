// app/grade-planner/[subject].tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useNavigation } from "expo-router";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareFlatList } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeProvider";

export type Assessment = {
  id: string;
  name: string;
  weight: string;
  grade?: string;
  type?: "Assignment" | "Exam" | "Other";
};

const seed: Assessment[] = [
  { id: "a1", name: "Assignment 1", weight: "20", grade: "", type: "Assignment" },
  { id: "a2", name: "Assignment 2", weight: "30", grade: "", type: "Assignment" },
  { id: "exam", name: "Exam", weight: "50", grade: "", type: "Exam" },
];

function toNum(s?: string) {
  const n = Number((s ?? "").toString().replace(/,/g, "."));
  return isNaN(n) ? 0 : n;
}
function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

export default function SubjectPlannerScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { subject } = useLocalSearchParams<{ subject: string }>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();

  const code = decodeURIComponent(subject ?? "").toUpperCase();
  const STORAGE_KEY = `grade-planner:${code}`;

  const [items, setItems] = useState<Assessment[]>(seed);
  const [showAdd, setShowAdd] = useState(false);

  // Footer height measured so we can pad list bottom correctly
  const [footerH, setFooterH] = useState(72);

  // FlatList ref (no generic to avoid type issues)
  const listRef = useRef<any>(null);

  useLayoutEffect(() => {
    nav.setOptions({
      title: `Grade Planner • ${code}`,
      headerStyle: { backgroundColor: theme.navBg },
      headerTintColor: theme.navText,
      headerTitleStyle: { color: theme.navText },
    });
  }, [nav, code, theme]);

  // Load/save
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.items)) setItems(parsed.items);
        }
      } catch {}
    })();
  }, [STORAGE_KEY]);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ items })).catch(() => {});
  }, [items, STORAGE_KEY]);

  // Stats
  const { sumContribution, totalWeight } = useMemo(() => {
    const totalWeight = items.reduce((acc, i) => acc + clamp(toNum(i.weight)), 0);
    const contributions = items
      .map((i) => {
        const w = clamp(toNum(i.weight));
        const g = i.grade === undefined || i.grade === "" ? null : clamp(toNum(i.grade));
        return g === null ? 0 : (w * g) / 100;
      })
      .reduce((a, b) => a + b, 0);
    return { sumContribution: contributions, totalWeight };
  }, [items]);

  const isPerfect = Math.abs(totalWeight - 100) < 0.01;

  function updateItem(id: string, patch: Partial<Assessment>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }
  function addItem(newItem: Assessment) {
    setItems((prev) => [...prev, newItem]);
  }

  // List padding: room for footer + safe area. KeyboardAwareFlatList handles keyboard.
  const listBottomPad = insets.bottom + footerH + 24;

  // Footer
  const Footer = (
    <View
      style={[s.footer, { paddingBottom: insets.bottom + 8 }]}
      onLayout={(e: LayoutChangeEvent) => setFooterH(e.nativeEvent.layout.height)}
    >
      <View style={s.bottomRowEven}>
        {/* Add item */}
        <View style={s.bottomItem}>
          <Pressable
            onPress={() => setShowAdd(true)}
            style={[s.primaryBtn, s.fullWidthBtn, { backgroundColor: theme.primary }]}
          >
            <Text style={[s.primaryBtnText, { color: theme.primaryText }]}>Add item</Text>
          </Pressable>
        </View>

        {/* Total weighting pill */}
        <View style={[s.bottomItem, { alignItems: "center" }]}>
          <View
            style={[
              s.weightPill,
              { borderColor: isPerfect ? theme.success : theme.danger, backgroundColor: theme.card },
            ]}
          >
            <Text style={[s.weightPillText, { color: isPerfect ? theme.success : theme.danger }]}>
              {isPerfect ? `Total weighting = 100%` : `Total weighting = ${totalWeight.toFixed(1)}%`}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[s.screen]} edges={["top", "left", "right"]}>
      <KeyboardAwareFlatList
        ref={listRef}
        data={items}
        keyExtractor={(i) => i.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={280}        // lifts focused input well above keyboard
        enableAutomaticScroll
        contentContainerStyle={{ padding: 16, paddingBottom: listBottomPad }}
        ListHeaderComponent={
          <View style={s.banner}>
            <Text style={s.bannerLabel}>Accumulated Grade so far</Text>
            <Text style={s.bannerValue}>{sumContribution.toFixed(1)}%</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => (
          <View style={s.card}>
            <TextInput
              value={item.name}
              onChangeText={(t) => updateItem(item.id, { name: t })}
              placeholder="Assessment name"
              placeholderTextColor={theme.textMuted}
              style={[s.inputText, { marginBottom: 8 }]}
              returnKeyType="next"
              blurOnSubmit={false}
            />

            <View style={s.row}>
              <View style={{ width: 96, flexGrow: 1 }}>
                <Text style={s.label}>Weight %</Text>
                <TextInput
                  keyboardType="numeric"
                  value={item.weight}
                  onChangeText={(t) => updateItem(item.id, { weight: t.replace(/[^0-9.]/g, "") })}
                  placeholder="%"
                  placeholderTextColor={theme.textMuted}
                  style={s.input}
                  returnKeyType="next"
                  blurOnSubmit={false}
                />
              </View>
              <View style={{ width: 120, flexGrow: 1 }}>
                <Text style={s.label}>Grade %</Text>
                <TextInput
                  keyboardType="numeric"
                  value={item.grade ?? ""}
                  onChangeText={(t) => updateItem(item.id, { grade: t.replace(/[^0-9.]/g, "") })}
                  placeholder="(blank = N/A)"
                  placeholderTextColor={theme.textMuted}
                  style={s.input}
                  returnKeyType="done"
                />
              </View>
            </View>

            <View style={s.cardFooter}>
              <Text style={s.smallMuted}>Type: {item.type ?? "Other"}</Text>
              <Text style={s.small}>
                Contribution: {(((toNum(item.weight) * toNum(item.grade)) / 100) || 0).toFixed(1)}%
              </Text>
            </View>

            <View style={[s.row, { marginTop: 12 }]}>
              <Pressable onPress={() => removeItem(item.id)} style={[s.smallBtn, { backgroundColor: theme.danger }]}>
                <Text style={s.smallBtnText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListFooterComponent={Footer}
      />

      {/* Add item modal (keyboard-safe) */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }} edges={["top"]}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
          >
            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              <View style={s.modalCard}>
                <Text style={s.modalTitle}>Add assessment</Text>
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
                  <AddForm
                    onCancel={() => setShowAdd(false)}
                    onAdd={(payload) => {
                      addItem(payload);
                      setShowAdd(false);
                    }}
                  />
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      <SafeAreaView edges={["bottom"]} style={{ backgroundColor: theme.bg }} />
    </SafeAreaView>
  );
}

function AddForm({ onCancel, onAdd }: { onCancel: () => void; onAdd: (a: Assessment) => void }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [grade, setGrade] = useState("");

  // focus chain so next field is never hidden
  const weightRef = React.useRef<TextInput>(null);
  const gradeRef = React.useRef<TextInput>(null);

  function submit() {
    if (!name.trim()) return Alert.alert("Name required");
    if (!weight.trim()) return Alert.alert("Weight % required");
    const id = `${Date.now()}`;
    onAdd({
      id,
      name: name.trim(),
      weight: weight.replace(/[^0-9.]/g, ""),
      grade: grade.replace(/[^0-9.]/g, ""),
      type: name.toLowerCase().includes("exam") ? "Exam" : "Assignment",
    });
  }

  return (
    <View>
      <View style={{ marginBottom: 12 }}>
        <Text style={s.label}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Assignment 1"
          placeholderTextColor={theme.textMuted}
          style={s.input}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => weightRef.current?.focus()}
        />
      </View>
      <View style={[s.row, { marginBottom: 16 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>Weight %</Text>
          <TextInput
            ref={weightRef}
            value={weight}
            onChangeText={(t) => setWeight(t.replace(/[^0-9.]/g, ""))}
            keyboardType={Platform.OS === "ios" ? "decimal-pad" : "number-pad"}
            inputMode="decimal"
            placeholder="e.g. 20"
            placeholderTextColor={theme.textMuted}
            style={s.input}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => gradeRef.current?.focus()}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>Grade % (optional)</Text>
          <TextInput
            ref={gradeRef}
            value={grade}
            onChangeText={(t) => setGrade(t.replace(/[^0-9.]/g, ""))}
            keyboardType={Platform.OS === "ios" ? "decimal-pad" : "number-pad"}
            inputMode="decimal"
            placeholder="leave blank if unknown"
            placeholderTextColor={theme.textMuted}
            style={s.input}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </View>
      </View>

      <View style={s.row}>
        <Pressable onPress={onCancel} style={[s.neutralBtn, { backgroundColor: theme.border }]}>
          <Text style={s.neutralBtnText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={submit} style={[s.primaryBtn, { backgroundColor: theme.primary }]}>
          <Text style={[s.primaryBtnText, { color: theme.primaryText }]}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (t: ReturnType<typeof useTheme>["theme"]) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },

    banner: {
      marginTop: 0,
      marginHorizontal: 0,
      marginBottom: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 18,
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
    },
    bannerLabel: { color: t.textMuted, fontSize: 12, fontWeight: "600", marginBottom: 2 },
    bannerValue: { color: t.success, fontSize: 28, fontWeight: "800" },

    card: { borderRadius: 16, padding: 16, backgroundColor: t.card, borderColor: t.border, borderWidth: 1 },
    input: {
      color: t.text,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: Platform.select({ ios: 10, android: 8 }),
      backgroundColor: t.card,
      fontSize: 16,
    },
    inputText: { color: t.text, fontSize: 16 },
    label: { color: t.textMuted, fontSize: 12, marginBottom: 4 },
    row: { flexDirection: "row", columnGap: 12 },

    cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
    small: { color: t.text, fontSize: 12 },
    smallMuted: { color: t.textMuted, fontSize: 12 },

    smallBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
    smallBtnText: { color: "#fff" },

    footer: {
      backgroundColor: t.navBg,
      borderTopColor: t.border,
      borderTopWidth: 1,
      paddingTop: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      marginTop: 12,
    },
    bottomRowEven: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", columnGap: 12 },
    bottomItem: { flex: 1 },
    fullWidthBtn: { width: "100%", alignItems: "center" },

    weightPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, backgroundColor: t.card },
    weightPillText: { fontSize: 14, fontWeight: "600" },

    modalCard: {
      width: "100%",
      backgroundColor: t.bg,
      borderTopColor: t.border,
      borderTopWidth: 1,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 16,
    },
    modalTitle: { color: t.text, fontSize: 18, fontWeight: "600", marginBottom: 12 },

    primaryBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, alignItems: "center" },
    primaryBtnText: { fontWeight: "700" },
    neutralBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, alignItems: "center" },
    neutralBtnText: { color: t.text },
  });
