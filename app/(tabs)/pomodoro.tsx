// app/(tabs)/pomodoro.tsx

// Icons for play/pause/reset buttons
import { Ionicons } from "@expo/vector-icons";
// Local storage for saving subjects, selection, and logs
import AsyncStorage from "@react-native-async-storage/async-storage";
// Re-runs effects when this screen regains focus (handy when subjects change on Home tab)
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  AppStateStatus,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
// Insets for safe spacing at the bottom (gesture bar) and top (status bar)
import { useSafeAreaInsets } from "react-native-safe-area-context";
// App-wide theme colors (dark/lavender palettes)
import { useTheme } from "../../theme/ThemeProvider";

// ---------- types ----------
type Subject = { code: string; name: string };
type SessionEntry = { id: string; ts: string; subject: string | null; minutes: number };

// ---------- storage keys ----------
const SUBJECTS_KEY = "subjects-list:v1";
const SELECTED_SUBJECT_KEY = "pomodoro:selectedSubject";
const LOG_KEY = "pomodoro:log:v1";

// ---------- small helpers ----------
// Only allow digits in the input boxes
const numOnly = (s: string) => s.replace(/[^0-9]/g, "");
// Keep minutes at a sensible min of 1 (prevents 0 or empty timers)
const clampToMinute = (s: string) => {
  const n = parseInt(s || "0", 10);
  return isNaN(n) || n <= 0 ? 1 : n;
};
// Format YYYY-MM-DD for daily rollups
const isoLocalDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function PomodoroScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const insets = useSafeAreaInsets();

  // ---------- state ----------
  // Dynamic subjects loaded from Home tab; we mirror them here
  const [subjects, setSubjects] = useState<Subject[]>([]);
  // Currently active subject code (affects logs and chips)
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  // User-configured durations (in minutes as strings for TextInput binding)
  const [studyMin, setStudyMin] = useState("25");
  const [breakMin, setBreakMin] = useState("5");
  // Timer state
  const [remainingSec, setRemainingSec] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  // Local session history (we keep last N; used for today/overall views)
  const [log, setLog] = useState<SessionEntry[]>([]);

  // Interval reference for start/stop
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  // Anti-double-log guard when alert resolves quickly
  const justLoggedRef = useRef<number>(0);
  // Live phase ref so the interval reads the current phase (avoids stale closures)
  const onBreakRef = useRef(onBreak);
  useEffect(() => {
    onBreakRef.current = onBreak;
  }, [onBreak]);

  // ---------- storage loaders ----------
  // Pull subjects and remember last selected subject if still valid
  const loadSubjects = async () => {
    try {
      const raw = await AsyncStorage.getItem(SUBJECTS_KEY);
      const list: Subject[] = raw ? JSON.parse(raw) : [];
      setSubjects(list);

      const savedSel = await AsyncStorage.getItem(SELECTED_SUBJECT_KEY);
      const code = savedSel || null;
      if (code && list.some((s) => s.code === code)) {
        setSelectedCode(code);
      } else {
        setSelectedCode(list[0]?.code ?? null);
        if (!list[0]) await AsyncStorage.removeItem(SELECTED_SUBJECT_KEY);
      }
    } catch {}
  };

  // Load existing pomodoro session log
  const loadLog = async () => {
    try {
      const raw = await AsyncStorage.getItem(LOG_KEY);
      setLog(raw ? JSON.parse(raw) : []);
    } catch {
      setLog([]);
    }
  };

  // Persist log updates
  const saveLog = async (entries: SessionEntry[]) => {
    setLog(entries);
    await AsyncStorage.setItem(LOG_KEY, JSON.stringify(entries));
  };

  // When screen focuses (e.g., returning from Home), refresh subjects and log
  useFocusEffect(
    useCallback(() => {
      loadSubjects();
      loadLog();
    }, [])
  );

  // Also refresh when app moves from background → active (covers app switching)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        loadSubjects();
        loadLog();
      }
    });
    return () => sub.remove();
  }, []);

  // Keep selected subject remembered across launches
  useEffect(() => {
    if (selectedCode) AsyncStorage.setItem(SELECTED_SUBJECT_KEY, selectedCode).catch(() => {});
  }, [selectedCode]);

  // Helpers to read minutes (as numbers) from the string inputs
  const getStudyMinutes = () => clampToMinute(studyMin);
  const getBreakMinutes = () => clampToMinute(breakMin);

  // Reset either focus or break phase based on flag
  const resetPhase = (isBreak: boolean) => {
    setOnBreak(isBreak);
    onBreakRef.current = isBreak; // keep ref in sync immediately
    const mins = isBreak ? getBreakMinutes() : getStudyMinutes();
    setRemainingSec(mins * 60);
  };

  // Add a finished focus session to the log (debounced to prevent dupes)
  const logFocusCompletion = async (minutes: number) => {
    const nowMs = Date.now();
    if (nowMs - justLoggedRef.current < 750) return;
    justLoggedRef.current = nowMs;
    const entry: SessionEntry = {
      id: String(nowMs),
      ts: new Date(nowMs).toISOString(),
      subject: selectedCode,
      minutes,
    };
    const next = [entry, ...log].slice(0, 200);
    await saveLog(next);
  };

  // Start ticking the timer (includes end-of-phase alerts for focus and break)
  const start = () => {
    if (running) return;
    if (remainingSec <= 0) resetPhase(false);
    setRunning(true);

    timerRef.current = setInterval(() => {
      setRemainingSec((prev) => {
        if (prev <= 1) {
          const wasFocus = !onBreakRef.current;

          if (wasFocus) {
            // Focus finished → pause, log, and ask to start the break (or skip it)
            stop();
            logFocusCompletion(getStudyMinutes());

            Alert.alert("Nice work!", "Focus session complete. Ready for your break?", [
              {
                text: "Start break",
                onPress: () => {
                  setOnBreak(true);
                  onBreakRef.current = true;
                  setRemainingSec(getBreakMinutes() * 60);
                  start(); // resume ticking for the break phase
                },
              },
              {
                text: "Skip break",
                style: "cancel",
                onPress: () => {
                  setOnBreak(false);
                  onBreakRef.current = false;
                  setRemainingSec(getStudyMinutes() * 60); // remain paused; user can hit Start
                },
              },
            ]);

            return 0; // freeze display at 00:00 until next action
          }

          // Break finished → pause and ask whether to start another focus or skip focus
          stop();

          Alert.alert("Break finished", "Start another focus session?", [
            {
              text: "Start focus",
              onPress: () => {
                setOnBreak(false);
                onBreakRef.current = false;
                setRemainingSec(getStudyMinutes() * 60);
                start(); // resume with focus phase
              },
            },
            {
              text: "Skip focus",
              style: "cancel",
              onPress: () => {
                // Extend rest: keep in break mode and start another break immediately
                setOnBreak(true);
                onBreakRef.current = true;
                setRemainingSec(getBreakMinutes() * 60);
              },
            },
          ]);

          return 0; // freeze at 00:00 until user picks an option
        }

        return prev - 1;
      });
    }, 1000);
  };

  // Pause the timer
  const stop = () => {
    setRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  // Full reset back to focus phase
  const reset = () => {
    stop();
    resetPhase(false);
  };

  // If user edits minutes while paused, snap remaining time to new values
  useEffect(() => {
    if (!running) resetPhase(onBreak);
  }, [studyMin, breakMin]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ---------- time display ----------
  const mins = Math.floor(remainingSec / 60).toString().padStart(2, "0");
  const secs = Math.floor(remainingSec % 60).toString().padStart(2, "0");

  // ---------- summaries ----------
  // Today’s date key for grouping
  const todayKey = isoLocalDate(new Date());
  // Only entries from today
  const todayEntries = log.filter((e) => e.ts.slice(0, 10) === todayKey);
  // Sum minutes for the big number
  const todayTotal = todayEntries.reduce((a, e) => a + (e.minutes || 0), 0);

  // Rollup helper: { SUBJECT → total minutes }
  const rollup = (entries: SessionEntry[]) =>
    entries.reduce<Record<string, number>>((acc, e) => {
      const key = e.subject ?? "—";
      acc[key] = (acc[key] || 0) + (e.minutes || 0);
      return acc;
    }, {});
  const todayBySubject = rollup(todayEntries);
  const allTimeBySubject = rollup(log);

  // Overall minutes across the full log
  const overallTotal = log.reduce((sum, e) => sum + (e.minutes || 0), 0);

  // Only show the latest three entries under “Recent sessions”
  const recent3 = log.slice(0, 3);

  return (
    // ScrollView so smaller screens can reach all sections; bottom padding respects safe area
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
      {/* Subject Picker
          Chip list built from Home tab subjects; tap to select which subject to log against. */}
      <View style={s.card}>
        <Text style={s.label}>Subject</Text>
        {subjects.length === 0 ? (
          <Text style={s.muted}>No subjects yet. Add one on the Home tab.</Text>
        ) : (
          <View style={s.chipsRow}>
            {subjects.map((sub) => {
              const active = sub.code === selectedCode;
              return (
                <Pressable
                  key={sub.code}
                  onPress={() => setSelectedCode(sub.code)}
                  style={[
                    s.chip,
                    { backgroundColor: active ? theme.primary : theme.card, borderColor: active ? theme.primary : theme.border },
                  ]}
                >
                  <Text style={[s.chipText, { color: active ? theme.primaryText : theme.text }]}>{sub.code}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* Durations
          Number inputs for study/break lengths; kept simple and centered for quick edits. */}
      <View style={s.card}>
        <Text style={s.label}>Durations (minutes)</Text>
        <View style={s.row}>
          <View style={s.inputGroup}>
            <Text style={s.inputLabel}>Study</Text>
            <TextInput
              value={studyMin}
              onChangeText={(t) => setStudyMin(numOnly(t))}
              onBlur={() => setStudyMin((v) => (v.trim() === "" ? "1" : v))}
              keyboardType="number-pad"
              style={s.input}
              maxLength={3}
            />
          </View>
          <View style={s.inputGroup}>
            <Text style={s.inputLabel}>Break</Text>
            <TextInput
              value={breakMin}
              onChangeText={(t) => setBreakMin(numOnly(t))}
              onBlur={() => setBreakMin((v) => (v.trim() === "" ? "1" : v))}
              keyboardType="number-pad"
              style={s.input}
              maxLength={3}
            />
          </View>
        </View>
      </View>

      {/* Timer
          Large, readable timer with clear state (Focus/Break) and simple controls. */}
      <View style={s.timerCard}>
        <Text style={s.phase}>{onBreak ? "Break" : "Focus"}</Text>
        <Text style={s.timeDisplay}>
          {mins}:{secs}
        </Text>

        <View style={s.controls}>
          {!running ? (
            <Pressable onPress={start} style={[s.ctrlBtn, { backgroundColor: theme.primary }]}>
              <Ionicons name="play" size={18} color={theme.primaryText} />
              <Text style={[s.ctrlText, { color: theme.primaryText }]}>Start</Text>
            </Pressable>
          ) : (
            <Pressable onPress={stop} style={[s.ctrlBtn, { backgroundColor: theme.border }]}>
              <Ionicons name="pause" size={18} color={theme.text} />
              <Text style={[s.ctrlText, { color: theme.text }]}>Pause</Text>
            </Pressable>
          )}
          <Pressable onPress={reset} style={[s.ctrlBtn, { backgroundColor: "#E25563" }]}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={[s.ctrlText, { color: "#fff" }]}>Reset</Text>
          </Pressable>
        </View>
      </View>

      {/* Today summary + Recent log
          Small digest of what you’ve done today plus the last three sessions for context. */}
      <View style={s.card}>
        <Text style={s.title}>Today</Text>
        <Text style={s.todayText}>
          Focused <Text style={{ fontWeight: "800", color: theme.text }}>{todayTotal}</Text> min total
        </Text>

        {Object.keys(todayBySubject).length > 0 && (
          <View style={{ marginTop: 6 }}>
            {Object.entries(todayBySubject).map(([sub, mins]) => (
              <View key={`t-${sub}`} style={s.logRow}>
                <Text style={s.logLeft}>{sub}</Text>
                <Text style={s.logRight}>{mins}m</Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.divider} />

        <Text style={s.title}>Recent sessions</Text>
        {recent3.length === 0 ? (
          <Text style={s.muted}>No focus sessions yet.</Text>
        ) : (
          <View>
            {recent3.map((item) => {
              const d = new Date(item.ts);
              const clock = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
              const dateStr = item.ts.slice(0, 10);
              return (
                <View key={item.id} style={s.logRow}>
                  <Text style={s.logLeft}>
                    {dateStr} • {clock}
                  </Text>
                  <Text style={s.logRight}>
                    {item.subject ?? "—"} · {item.minutes}m
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Overall total
          Running grand total across the entire log. */}
      <View style={s.card}>
        <Text style={s.title}>Overall</Text>
        <Text style={s.todayText}>
          Total focus time across all days:{" "}
          <Text style={{ fontWeight: "800", color: theme.text }}>{log.reduce((sum, e) => sum + (e.minutes || 0), 0)}</Text> min
        </Text>
      </View>

      {/* All-time by subject
          High-level breakdown so you can see where your time is going. */}
      <View style={s.card}>
        <Text style={s.title}>All-time by subject</Text>
        {Object.keys(allTimeBySubject).length === 0 ? (
          <Text style={s.muted}>No data yet.</Text>
        ) : (
          Object.entries(allTimeBySubject).map(([sub, mins]) => (
            <View key={`a-${sub}`} style={s.logRow}>
              <Text style={s.logLeft}>{sub}</Text>
              <Text style={s.logRight}>{mins}m</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

// ---------- styles ----------
// All styles read colors from the theme so light/dark looks consistent everywhere.
const makeStyles = (t: any) =>
  StyleSheet.create({
    // Whole screen background + layout
    screen: { flex: 1, backgroundColor: t.bg },

    // Generic card surface
    card: {
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 14,
      marginHorizontal: 16,
      marginBottom: 12,
    },

    // Small label used for section headings in cards
    label: { color: t.text, fontSize: 12, marginBottom: 8, opacity: 0.8 },

    // Lighter text for secondary info
    muted: { color: t.textMuted },

    // Subject chips row
    chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1 },
    chipText: { fontSize: 13, fontWeight: "700" },

    // Two side-by-side inputs (study/break)
    row: { flexDirection: "row", gap: 12 },
    inputGroup: { flex: 1 },
    inputLabel: { color: t.textMuted, fontSize: 12, marginBottom: 6 },
    input: {
      color: t.text,
      borderColor: t.border,
      backgroundColor: t.card,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
      textAlign: "center",
    },

    // Timer card with large time and controls
    timerCard: {
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 20,
      paddingVertical: 24,
      alignItems: "center",
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 12,
    },
    phase: { color: t.textMuted, fontSize: 13, marginBottom: 4 },
    timeDisplay: { color: t.text, fontSize: 44, fontWeight: "800", letterSpacing: 1 },

    // Start/Pause/Reset
    controls: { flexDirection: "row", gap: 10, marginTop: 12 },
    ctrlBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14 },
    ctrlText: { fontWeight: "700", fontSize: 14 },

    // Section titles + small text helpers
    title: { color: t.text, fontSize: 16, fontWeight: "700", marginBottom: 6 },
    todayText: { color: t.text, fontSize: 14, marginBottom: 8 },
    divider: { height: 1, backgroundColor: t.border, marginVertical: 8, opacity: 0.8 },

    // Rows for today/recent/all-time
    logRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
    logLeft: { color: t.textMuted, fontSize: 12 },
    logRight: { color: t.text, fontSize: 12, fontWeight: "600" },
  });
