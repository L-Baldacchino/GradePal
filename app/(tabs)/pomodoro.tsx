// app/(tabs)/pomodoro.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from "react-native";
import { useTheme } from "../theme/ThemeProvider";
type Subject = { code: string; name: string };

const SUBJECTS_KEY = "subjects:v1";
const SESSIONS_KEY = "pomodoro:sessions:v1";

type Session = {
  id: string;
  subjectCode?: string | null;
  mode: "Focus" | "Break";
  seconds: number;
  finishedAt: number;
};

function formatMMSS(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function PomodoroScreen() {
  const { theme, toggleTheme } = useTheme();
  const s = makeStyles(theme);

  // Durations
  const [focusMin, setFocusMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);

  // State
  const [mode, setMode] = useState<"Focus" | "Break">("Focus");
  const [secondsLeft, setSecondsLeft] = useState(focusMin * 60);
  const [running, setRunning] = useState(false);

  // Subjects
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectModal, setSubjectModal] = useState(false);
  const [subjectCode, setSubjectCode] = useState<string | null>(null);

  // Sessions
  const [sessions, setSessions] = useState<Session[]>([]);

  // Time edit modal
  const [editTimeVisible, setEditTimeVisible] = useState(false);
  const [timeInput, setTimeInput] = useState("");

  // Themed header with toggle
  useLayoutEffect(() => {
    // Expo Router Tabs provides header, we theme it here
  }, [theme]);

  // Load subjects & sessions
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SUBJECTS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Subject[];
          if (Array.isArray(parsed)) setSubjects(parsed);
        }
      } catch {}
    })();
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSIONS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Session[];
          if (Array.isArray(parsed)) setSessions(parsed);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)).catch(() => {});
  }, [sessions]);

  useEffect(() => {
    if (running) return;
    setSecondsLeft((mode === "Focus" ? focusMin : breakMin) * 60);
  }, [focusMin, breakMin, mode, running]);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!running) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) { tryFinishCycle(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
  }, [running]);

  const totalSecondsPlanned = useMemo(
    () => (mode === "Focus" ? focusMin * 60 : breakMin * 60),
    [mode, focusMin, breakMin]
  );

  function tryFinishCycle() {
    Vibration.vibrate(500);
    const entry: Session = { id: `${Date.now()}`, subjectCode, mode, seconds: totalSecondsPlanned, finishedAt: Date.now() };
    setSessions((prev) => [entry, ...prev].slice(0, 100));
    const nextMode = mode === "Focus" ? "Break" : "Focus";
    setMode(nextMode);
    setRunning(false);
    setSecondsLeft((nextMode === "Focus" ? focusMin : breakMin) * 60);
    Alert.alert("Time's up!", `${mode} session complete. Switch to ${nextMode}?`, [{ text: "OK" }]);
  }

  function toggleRun() { setRunning((r) => !r); }
  function resetTimer() { setRunning(false); setSecondsLeft((mode === "Focus" ? focusMin : breakMin) * 60); }
  function switchMode() { setMode((m) => (m === "Focus" ? "Break" : "Focus")); setRunning(false); }
  function adjustFocus(delta: number) { setFocusMin((m) => Math.max(1, Math.min(180, m + delta))); }
  function adjustBreak(delta: number) { setBreakMin((m) => Math.max(1, Math.min(60, m + delta))); }

  const subjectLabel = useMemo(() => {
    if (!subjectCode) return "No subject";
    const found = subjects.find((s) => s.code === subjectCode);
    return found ? `${found.code} • ${found.name}` : subjectCode;
  }, [subjectCode, subjects]);

  const focusTodayBySubject = useMemo(() => {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const startMs = startOfDay.getTime();
    const map = new Map<string, number>();
    for (const s of sessions) {
      if (s.mode !== "Focus") continue;
      if (s.finishedAt < startMs) continue;
      const key = s.subjectCode || "No subject";
      map.set(key, (map.get(key) || 0) + s.seconds);
    }
    return Array.from(map.entries()).map(([key, seconds]) => ({ key, minutes: Math.round(seconds / 60) }));
  }, [sessions]);

  function openTimeEdit() {
    const currentMin = mode === "Focus" ? focusMin : breakMin;
    setTimeInput(String(currentMin));
    setEditTimeVisible(true);
  }
  function saveTimeEdit() {
    const minutes = Math.max(1, Math.min(240, Number(timeInput.replace(/[^0-9]/g, "")) || 0));
    if (mode === "Focus") setFocusMin(minutes); else setBreakMin(minutes);
    setRunning(false);
    setSecondsLeft(minutes * 60);
    setEditTimeVisible(false);
  }

  return (
    <SafeAreaView style={s.screen}>
      {/* Header row with theme toggle */}
      <View style={s.header}>
        <Text style={s.title}>Pomodoro</Text>
        <Pressable onPress={toggleTheme} style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
          <Ionicons name={theme.name === "dark" ? "sunny" : "moon"} size={20} color={theme.navText} />
        </Pressable>
      </View>
      <Text style={s.sub}>Tap the timer to type a custom duration.</Text>

      {/* Subject selector */}
      <View style={s.subjectRow}>
        <Text style={s.label}>Subject</Text>
        <Pressable onPress={() => setSubjectModal(true)} style={s.subjectBtn}>
          <Text style={s.subjectText}>{subjectLabel}</Text>
        </Pressable>
      </View>

      {/* Timer card */}
      <View style={s.timerCard}>
        <Text style={[s.mode, { color: mode === "Focus" ? theme.success : theme.primary }]}>{mode}</Text>

        <Pressable onPress={openTimeEdit}>
          <Text style={s.time}>{formatMMSS(secondsLeft)}</Text>
        </Pressable>

        <View style={s.controlsRow}>
          <Pressable onPress={switchMode} style={s.controlBtn}>
            <Text style={s.controlText}>Switch</Text>
          </Pressable>
          <Pressable onPress={toggleRun} style={[s.controlBtn, { backgroundColor: theme.primary }]}>
            <Text style={[s.primaryText, { color: theme.primaryText }]}>{running ? "Pause" : "Start"}</Text>
          </Pressable>
          <Pressable onPress={resetTimer} style={s.controlBtn}>
            <Text style={s.controlText}>Reset</Text>
          </Pressable>
        </View>

        {/* Durations */}
        <View style={s.block}>
          <Text style={s.blockTitle}>Durations (minutes)</Text>
          <View style={s.adjustRow}>
            <View style={s.adjustCol}>
              <Text style={s.adjustLabel}>Focus</Text>
              <View style={s.adjustBtns}>
                <Pressable onPress={() => adjustFocus(-5)} style={s.adjustBtn}><Text style={s.adjustText}>-5</Text></Pressable>
                <Text style={s.adjustValue}>{focusMin}</Text>
                <Pressable onPress={() => adjustFocus(+5)} style={s.adjustBtn}><Text style={s.adjustText}>+5</Text></Pressable>
              </View>
            </View>
            <View style={s.adjustCol}>
              <Text style={s.adjustLabel}>Break</Text>
              <View style={s.adjustBtns}>
                <Pressable onPress={() => adjustBreak(-1)} style={s.adjustBtn}><Text style={s.adjustText}>-1</Text></Pressable>
                <Text style={s.adjustValue}>{breakMin}</Text>
                <Pressable onPress={() => adjustBreak(+1)} style={s.adjustBtn}><Text style={s.adjustText}>+1</Text></Pressable>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Today summary */}
      <View style={s.summary}>
        <Text style={s.summaryTitle}>Today’s Focus (min)</Text>
        {focusTodayBySubject.length === 0 ? (
          <Text style={s.summaryEmpty}>No focus sessions yet.</Text>
        ) : (
          <FlatList
            data={focusTodayBySubject}
            keyExtractor={(i) => i.key}
            renderItem={({ item }) => (
              <View style={s.summaryRow}>
                <Text style={s.summaryKey}>{item.key}</Text>
                <Text style={s.summaryVal}>{item.minutes}</Text>
              </View>
            )}
          />
        )}
      </View>

      {/* Subject modal */}
      <Modal visible={subjectModal} transparent animationType="slide" onRequestClose={() => setSubjectModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Choose subject</Text>
            <Pressable style={s.subjectRowItem} onPress={() => { setSubjectCode(null); setSubjectModal(false); }}>
              <Text style={s.subjectItemText}>No subject</Text>
            </Pressable>
            <FlatList
              data={subjects}
              keyExtractor={(sub) => sub.code}
              renderItem={({ item }) => (
                <Pressable style={s.subjectRowItem} onPress={() => { setSubjectCode(item.code); setSubjectModal(false); }}>
                  <Text style={s.subjectItemText}>{item.code} • {item.name}</Text>
                </Pressable>
              )}
            />
            <Pressable onPress={() => setSubjectModal(false)} style={[s.controlBtn, { alignSelf: "flex-end", marginTop: 8 }]}>
              <Text style={s.controlText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Time edit modal */}
      <Modal visible={editTimeVisible} transparent animationType="fade" onRequestClose={() => setEditTimeVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.editOverlay}>
          <View style={s.editCard}>
            <Text style={s.editTitle}>Set {mode} minutes</Text>
            <TextInput
              autoFocus
              keyboardType="numeric"
              inputMode="numeric"
              value={timeInput}
              onChangeText={(t) => setTimeInput(t.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 25"
              placeholderTextColor={theme.textMuted}
              style={s.editInput}
              maxLength={3}
            />
            <View style={s.editRow}>
              <Pressable onPress={() => setEditTimeVisible(false)} style={s.controlBtn}>
                <Text style={s.controlText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveTimeEdit} style={[s.controlBtn, { backgroundColor: theme.primary }]}>
                <Text style={[s.primaryText, { color: theme.primaryText }]}>Save</Text>
              </Pressable>
            </View>
            <Text style={s.editHint}>Timer will reset to the new duration and pause.</Text>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (t: ReturnType<typeof useTheme>["theme"]) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    header: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: t.navBg, borderBottomColor: t.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    title: { color: t.navText, fontSize: 22, fontWeight: "800" },
    sub: { color: t.textMuted, paddingHorizontal: 16, paddingTop: 6 },

    subjectRow: { paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: t.border, borderBottomWidth: 1 },
    label: { color: t.textMuted, fontSize: 12, marginBottom: 6 },
    subjectBtn: { backgroundColor: t.card, borderColor: t.border, borderWidth: 1, borderRadius: 12, padding: 12 },
    subjectText: { color: t.text },

    timerCard: { margin: 16, borderRadius: 16, backgroundColor: t.card, borderColor: t.border, borderWidth: 1, padding: 16 },
    mode: { fontSize: 14, fontWeight: "700", letterSpacing: 0.5, marginBottom: 8 },
    time: { color: t.text, fontSize: 56, fontWeight: "800", letterSpacing: 2, textAlign: "center", marginVertical: 8 },

    controlsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", columnGap: 12, marginTop: 8 },
    controlBtn: { backgroundColor: t.border, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14 },
    controlText: { color: t.text, fontWeight: "600" },
    primaryText: { fontWeight: "800" },

    block: { marginTop: 16 },
    blockTitle: { color: t.text, fontWeight: "700", marginBottom: 8 },
    adjustRow: { flexDirection: "row", columnGap: 12 },
    adjustCol: { flex: 1, backgroundColor: t.card, borderColor: t.border, borderWidth: 1, borderRadius: 12, padding: 12 },
    adjustLabel: { color: t.textMuted, marginBottom: 8 },
    adjustBtns: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    adjustBtn: { backgroundColor: t.border, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
    adjustText: { color: t.text, fontWeight: "700" },
    adjustValue: { color: t.text, fontSize: 18, fontWeight: "800" },

    summary: { marginHorizontal: 16, marginBottom: 16, backgroundColor: t.card, borderColor: t.border, borderWidth: 1, borderRadius: 14, padding: 12 },
    summaryTitle: { color: t.text, fontWeight: "700", marginBottom: 8 },
    summaryEmpty: { color: t.textMuted },
    summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
    summaryKey: { color: t.text },
    summaryVal: { color: t.text, fontWeight: "700" },

    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "flex-end" },
    modalCard: { width: "100%", maxHeight: "70%", backgroundColor: t.bg, borderTopColor: t.border, borderTopWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16 },
    modalTitle: { color: t.text, fontSize: 18, fontWeight: "700", marginBottom: 10 },
    subjectRowItem: { paddingVertical: 10, borderBottomColor: t.border, borderBottomWidth: 1 },
    subjectItemText: { color: t.text },

    editOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
    editCard: { width: "100%", backgroundColor: t.bg, borderColor: t.border, borderWidth: 1, borderRadius: 16, padding: 16 },
    editTitle: { color: t.text, fontSize: 18, fontWeight: "800", marginBottom: 10 },
    editInput: { color: t.text, borderColor: t.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 18, textAlign: "center", backgroundColor: t.card },
    editRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
    editHint: { color: t.textMuted, marginTop: 8, fontSize: 12 },
  });
