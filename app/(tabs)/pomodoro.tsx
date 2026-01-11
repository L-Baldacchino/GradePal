// app/(tabs)/pomodoro.tsx
//

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeProvider";

type Subject = { code: string; name: string; finalMark?: number; isExempt?: boolean };
type SessionEntry = { id: string; ts: string; subject: string | null; minutes: number };

const SUBJECTS_KEY = "subjects-list:v1";
const SELECTED_SUBJECT_KEY = "pomodoro:selectedSubject";
const LOG_KEY = "pomodoro:log:v1";

const numOnly = (s: string) => s.replace(/[^0-9]/g, "");
const clampToMinute = (s: string) => {
  const n = parseInt(s || "0", 10);
  return isNaN(n) || n <= 0 ? 1 : n;
};
const isoLocalDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function isCompletedSubjectLike(sub: Subject) {
  // same logic as index: completed if finalMark exists OR exempt
  if (typeof sub.finalMark === "number" && Number.isFinite(sub.finalMark)) return true;
  if (sub.isExempt) return true;
  return false;
}

export default function PomodoroScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const insets = useSafeAreaInsets();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const [studyMin, setStudyMin] = useState("25");
  const [breakMin, setBreakMin] = useState("5");

  const [remainingSec, setRemainingSec] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [onBreak, setOnBreak] = useState(false);

  const [log, setLog] = useState<SessionEntry[]>([]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const justLoggedRef = useRef<number>(0);
  const onBreakRef = useRef(onBreak);
  useEffect(() => {
    onBreakRef.current = onBreak;
  }, [onBreak]);

  const loadSubjects = async () => {
    try {
      const raw = await AsyncStorage.getItem(SUBJECTS_KEY);
      const list: Subject[] = raw ? JSON.parse(raw) : [];

      // ✅ FILTER OUT COMPLETED SUBJECTS for the selector
      const active = list.filter((s) => !isCompletedSubjectLike(s));
      setSubjects(active);

      const savedSel = await AsyncStorage.getItem(SELECTED_SUBJECT_KEY);
      const code = savedSel || null;

      if (code && active.some((s) => s.code === code)) {
        setSelectedCode(code);
      } else {
        setSelectedCode(active[0]?.code ?? null);
        if (!active[0]) await AsyncStorage.removeItem(SELECTED_SUBJECT_KEY);
      }
    } catch {}
  };

  const loadLog = async () => {
    try {
      const raw = await AsyncStorage.getItem(LOG_KEY);
      setLog(raw ? JSON.parse(raw) : []);
    } catch {
      setLog([]);
    }
  };

  const saveLog = async (entries: SessionEntry[]) => {
    setLog(entries);
    await AsyncStorage.setItem(LOG_KEY, JSON.stringify(entries));
  };

  useFocusEffect(
    useCallback(() => {
      loadSubjects();
      loadLog();
    }, [])
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        loadSubjects();
        loadLog();
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (selectedCode) AsyncStorage.setItem(SELECTED_SUBJECT_KEY, selectedCode).catch(() => {});
  }, [selectedCode]);

  const getStudyMinutes = () => clampToMinute(studyMin);
  const getBreakMinutes = () => clampToMinute(breakMin);

  const resetPhase = (isBreak: boolean) => {
    setOnBreak(isBreak);
    onBreakRef.current = isBreak;
    const mins = isBreak ? getBreakMinutes() : getStudyMinutes();
    setRemainingSec(mins * 60);
  };

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

  const start = () => {
    if (running) return;
    if (remainingSec <= 0) resetPhase(false);
    setRunning(true);

    timerRef.current = setInterval(() => {
      setRemainingSec((prev) => {
        if (prev <= 1) {
          const wasFocus = !onBreakRef.current;

          if (wasFocus) {
            stop();
            logFocusCompletion(getStudyMinutes());

            Alert.alert("Nice work!", "Focus session complete. Ready for your break?", [
              {
                text: "Start break",
                onPress: () => {
                  setOnBreak(true);
                  onBreakRef.current = true;
                  setRemainingSec(getBreakMinutes() * 60);
                  start();
                },
              },
              {
                text: "Skip break",
                style: "cancel",
                onPress: () => {
                  setOnBreak(false);
                  onBreakRef.current = false;
                  setRemainingSec(getStudyMinutes() * 60);
                },
              },
            ]);

            return 0;
          }

          stop();

          Alert.alert("Break finished", "Start another focus session?", [
            {
              text: "Start focus",
              onPress: () => {
                setOnBreak(false);
                onBreakRef.current = false;
                setRemainingSec(getStudyMinutes() * 60);
                start();
              },
            },
            {
              text: "Skip focus",
              style: "cancel",
              onPress: () => {
                setOnBreak(true);
                onBreakRef.current = true;
                setRemainingSec(getBreakMinutes() * 60);
              },
            },
          ]);

          return 0;
        }

        return prev - 1;
      });
    }, 1000);
  };

  const stop = () => {
    setRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const reset = () => {
    stop();
    resetPhase(false);
  };

  useEffect(() => {
    if (!running) resetPhase(onBreak);
  }, [studyMin, breakMin]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const mins = Math.floor(remainingSec / 60).toString().padStart(2, "0");
  const secs = Math.floor(remainingSec % 60).toString().padStart(2, "0");

  const todayKey = isoLocalDate(new Date());
  const todayEntries = log.filter((e) => e.ts.slice(0, 10) === todayKey);
  const todayTotal = todayEntries.reduce((a, e) => a + (e.minutes || 0), 0);

  const rollup = (entries: SessionEntry[]) =>
    entries.reduce<Record<string, number>>((acc, e) => {
      const key = e.subject ?? "—";
      acc[key] = (acc[key] || 0) + (e.minutes || 0);
      return acc;
    }, {});
  const todayBySubject = rollup(todayEntries);
  const allTimeBySubject = rollup(log);

  const recent3 = log.slice(0, 3);

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
      <View style={s.card}>
        <Text style={s.label}>Subject</Text>
        {subjects.length === 0 ? (
          <Text style={s.muted}>No active subjects yet. Add one on the Subjects tab.</Text>
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
                    {
                      backgroundColor: active ? theme.primary : theme.card,
                      borderColor: active ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Text style={[s.chipText, { color: active ? theme.primaryText : theme.text }]}>{sub.code}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

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

      <View style={s.card}>
        <Text style={s.title}>Overall</Text>
        <Text style={s.todayText}>
          Total focus time across all days:{" "}
          <Text style={{ fontWeight: "800", color: theme.text }}>{log.reduce((sum, e) => sum + (e.minutes || 0), 0)}</Text>{" "}
          min
        </Text>
      </View>

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

const makeStyles = (t: any) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    card: {
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 14,
      marginHorizontal: 16,
      marginBottom: 12,
    },
    label: { color: t.text, fontSize: 12, marginBottom: 8, opacity: 0.8 },
    muted: { color: t.textMuted },

    chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1 },
    chipText: { fontSize: 13, fontWeight: "700" },

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

    controls: { flexDirection: "row", gap: 10, marginTop: 12 },
    ctrlBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14 },
    ctrlText: { fontWeight: "700", fontSize: 14 },

    title: { color: t.text, fontSize: 16, fontWeight: "700", marginBottom: 6 },
    todayText: { color: t.text, fontSize: 14, marginBottom: 8 },
    divider: { height: 1, backgroundColor: t.border, marginVertical: 8, opacity: 0.8 },

    logRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
    logLeft: { color: t.textMuted, fontSize: 12 },
    logRight: { color: t.text, fontSize: 12, fontWeight: "600" },
  });
