// app/(tabs)/planner.tsx
//

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  getTimeline,
  removeTimelineEvent,
  sortTimeline,
  upsertTimelineEvent
} from "../../_lib/timelineStorage";
import { TimelineEvent, TimelineKind } from "../../_lib/timelineTypes";
import { useTheme } from "../../theme/ThemeProvider";

// -------------------------------
// Storage keys
// -------------------------------
type Subject = { code: string; name: string; finalMark?: number; isExempt?: boolean };
const SUBJECTS_KEY = "subjects-list:v1";
const PLANNER_UI_KEY = "planner-ui:v1";

// -------------------------------
// Date helpers (ISO storage, DD-MMM-YYYY display)
// -------------------------------
const MMM = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n: number) => String(n).padStart(2, "0");

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dateObjToISO(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isoToDateObj(iso?: string) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const dd = Number(m[3]);
  const dt = new Date(y, mo, dd);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== dd) return null;
  return dt;
}

function isoToDisplay(iso?: string) {
  const dt = isoToDateObj(iso);
  if (!dt) return "";
  const dd = pad2(dt.getDate());
  const mon = MMM[dt.getMonth()] ?? "???";
  const yyyy = dt.getFullYear();
  return `${dd}-${mon}-${yyyy}`;
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function toNum(s?: string) {
  const n = Number(String(s ?? "").replace(/,/g, "."));
  return Number.isNaN(n) ? 0 : n;
}

// -------------------------------
// Subject completion (MATCH Pomodoro)
// -------------------------------
function isCompletedSubjectLike(sub: Subject) {
  if (typeof sub.finalMark === "number" && Number.isFinite(sub.finalMark)) return true;
  if (sub.isExempt) return true;
  return false;
}

// -------------------------------
// Timeline completed logic
// -------------------------------
// Completion rules:
// - If event.isComplete === true -> completed
// - Else if assessment/exam and grade exists -> completed
function isEventCompleted(e: TimelineEvent) {
  if (e?.isComplete) return true;
  const kind = e?.kind as TimelineKind;
  const isAssy = kind === "assessment" || kind === "exam";
  if (!isAssy) return false;
  return typeof e.grade === "number" && Number.isFinite(e.grade);
}

// -------------------------------
// Date picker modal (cross-platform)
// -------------------------------
function DatePickerModal({
  visible,
  initialISO,
  onCancel,
  onConfirm,
  theme,
}: {
  visible: boolean;
  initialISO?: string;
  onCancel: () => void;
  onConfirm: (iso: string) => void;
  theme: any;
}) {
  const initial = isoToDateObj(initialISO) ?? new Date();
  const [temp, setTemp] = useState<Date>(initial);

  useEffect(() => {
    if (!visible) return;
    setTemp(isoToDateObj(initialISO) ?? new Date());
  }, [visible, initialISO]);

  if (!visible) return null;

  if (Platform.OS === "android") {
    return (
      <DateTimePicker
        value={temp}
        mode="date"
        display="calendar"
        onChange={(event: any, selected?: Date) => {
          if (event?.type === "dismissed") {
            onCancel();
            return;
          }
          const picked = selected ?? temp;
          onConfirm(dateObjToISO(picked));
        }}
      />
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "center",
          alignItems: "center",
          padding: 22,
        }}
        onPress={() => {}}
      >
        <View
          style={{
            width: "100%",
            borderRadius: 18,
            padding: 14,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.card,
          }}
        >
          <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16, marginBottom: 10 }}>
            Select date
          </Text>

          <DateTimePicker
            value={temp}
            mode="date"
            display="spinner"
            onChange={(_, selected) => {
              if (selected) setTemp(selected);
            }}
            style={{ marginBottom: 10 }}
          />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={onCancel}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 14,
                alignItems: "center",
                backgroundColor: theme.border,
              }}
            >
              <Text style={{ color: theme.text, fontWeight: "900" }}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={() => onConfirm(dateObjToISO(temp))}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 14,
                alignItems: "center",
                backgroundColor: theme.primary,
              }}
            >
              <Text style={{ color: theme.primaryText, fontWeight: "900" }}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

// -------------------------------
// Subjects list loader (MATCH Pomodoro)
// ✅ Only return ACTIVE subjects for chips (not completed)
// -------------------------------
async function loadSubjectsList(): Promise<Subject[]> {
  try {
    const raw = await AsyncStorage.getItem(SUBJECTS_KEY);
    const list: Subject[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];

    const cleaned = list
      .map((s: any) => ({
        code: String(s?.code ?? "").toUpperCase().trim(),
        name: String(s?.name ?? "").trim(),
        finalMark: typeof s?.finalMark === "number" ? s.finalMark : undefined,
        isExempt: !!s?.isExempt,
      }))
      .filter((s) => s.code.length > 0);

    // ✅ match Pomodoro: selector excludes completed subjects
    return cleaned.filter((s) => !isCompletedSubjectLike(s));
  } catch {
    return [];
  }
}

// -------------------------------
// UI: Subject code chips
// -------------------------------
function SubjectCodePicker({
  subjects,
  value,
  onChange,
  theme,
  s,
}: {
  subjects: Subject[];
  value?: string;
  onChange: (code?: string) => void;
  theme: any;
  s: any;
}) {
  if (!subjects.length) {
    return (
      <Text style={[s.helperText, { color: theme.textMuted, marginTop: 6 }]}>
        No active subjects found. Completed subjects don’t appear here.
      </Text>
    );
  }

  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Pressable
          onPress={() => onChange(undefined)}
          style={[s.chip, !value && [s.chipActive, { borderColor: theme.primary }]]}
        >
          <Text style={[s.chipText, !value && { color: theme.primary }]}>None</Text>
        </Pressable>

        {subjects.map((sub) => {
          const active = (value ?? "").toUpperCase() === sub.code.toUpperCase();
          return (
            <Pressable
              key={sub.code}
              onPress={() => onChange(sub.code)}
              style={[s.chip, active && [s.chipActive, { borderColor: theme.primary }]]}
            >
              <Text style={[s.chipText, active && { color: theme.primary }]}>{sub.code}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// -------------------------------
// Main screen
// -------------------------------
export default function PlannerScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [timeline, setTimelineState] = useState<TimelineEvent[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [hideCompleted, setHideCompleted] = useState<boolean>(false);

  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editing, setEditing] = useState<TimelineEvent | null>(null);

  // Load UI prefs (hide completed)
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PLANNER_UI_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (typeof parsed?.hideCompleted === "boolean") setHideCompleted(parsed.hideCompleted);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(PLANNER_UI_KEY, JSON.stringify({ hideCompleted })).catch(() => {});
  }, [hideCompleted]);

  // Focus: refresh subjects + timeline
  useFocusEffect(
    useCallback(() => {
      let alive = true;

      (async () => {
        const [subs, tl] = await Promise.all([loadSubjectsList(), getTimeline()]);
        if (!alive) return;

        setSubjects(subs);
        setTimelineState(sortTimeline(tl));
      })();

      return () => {
        alive = false;
      };
    }, [])
  );

  const visibleTimeline = useMemo(() => {
    const base = [...timeline];
    return hideCompleted ? base.filter((e) => !isEventCompleted(e)) : base;
  }, [timeline, hideCompleted]);

  const completedCount = useMemo(() => timeline.filter((e) => isEventCompleted(e)).length, [timeline]);

  async function refreshTimeline() {
    const tl = await getTimeline();
    setTimelineState(sortTimeline(tl));
  }

  function openEdit(e: TimelineEvent) {
    setEditing(e);
    setShowEdit(true);
  }

  async function toggleComplete(e: TimelineEvent) {
    const completedNow = isEventCompleted(e);

    const next: TimelineEvent = {
      ...e,
      isComplete: completedNow ? false : true,
      updatedAt: Date.now(),
      createdAt: e.createdAt ?? Date.now(),
    };

    await upsertTimelineEvent(next);
    await refreshTimeline();
  }

  async function confirmDelete(e: TimelineEvent) {
    Alert.alert("Delete item", `Delete "${e.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await removeTimelineEvent(e.id);
          await refreshTimeline();
        },
      },
    ]);
  }

  const Header = (
    <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 10 }}>
      <View style={s.headerCard}>
        <Text style={s.headerTitle}>Planner</Text>
        <Text style={s.headerSubtitle}>
          {hideCompleted
            ? `Showing incomplete items • ${completedCount} completed hidden`
            : `Showing all items • ${completedCount} completed`}
        </Text>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Pressable onPress={() => setShowAdd(true)} style={[s.primaryBtn, { backgroundColor: theme.primary }]}>
            <Ionicons name="add" size={18} color={theme.primaryText} />
            <Text style={[s.primaryBtnText, { color: theme.primaryText }]}>Add item</Text>
          </Pressable>

          <Pressable
            onPress={() => setHideCompleted((p) => !p)}
            style={[
              s.toggleBtn,
              {
                borderColor: hideCompleted ? theme.primary : theme.border,
                backgroundColor: theme.card,
              },
            ]}
          >
            <Ionicons
              name={hideCompleted ? "eye-off-outline" : "eye-outline"}
              size={18}
              color={hideCompleted ? theme.primary : theme.textMuted}
            />
            <Text style={[s.toggleBtnText, { color: hideCompleted ? theme.primary : theme.textMuted }]}>
              Hide completed
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[s.screen]}>
      <ScrollView keyboardShouldPersistTaps="handled">
        {Header}

        <View style={{ paddingHorizontal: 16, paddingBottom: 24, gap: 12 }}>
          {visibleTimeline.length === 0 ? (
            <View style={s.emptyCard}>
              <Text style={s.emptyTitle}>Nothing here yet</Text>
              <Text style={s.emptyText}>
                Add an item (assessment, exam, lecture, todo, custom). Link it to an active subject if you want.
              </Text>
            </View>
          ) : (
            visibleTimeline.map((e) => (
              <Pressable key={e.id} onPress={() => openEdit(e)} style={s.itemCard}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                  <Pressable onPress={() => toggleComplete(e)} hitSlop={10} style={s.checkbox}>
                    <Ionicons
                      name={isEventCompleted(e) ? "checkbox-outline" : "square-outline"}
                      size={22}
                      color={isEventCompleted(e) ? theme.success : theme.textMuted}
                    />
                  </Pressable>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        s.itemTitle,
                        isEventCompleted(e) && { opacity: 0.55, textDecorationLine: "line-through" },
                      ]}
                    >
                      {e.title}
                    </Text>

                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                      <View style={s.pill}>
                        <Text style={s.pillText}>{String(e.kind ?? "custom")}</Text>
                      </View>

                      {(e.subjectCode ?? "").trim() !== "" && (
                        <View style={[s.pill, { borderColor: theme.primary }]}>
                          <Text style={[s.pillText, { color: theme.primary }]}>{String(e.subjectCode).toUpperCase()}</Text>
                        </View>
                      )}

                      {(e.dateISO ?? "").trim() !== "" && (
                        <View style={s.pill}>
                          <Ionicons name="calendar-outline" size={14} color={theme.textMuted} />
                          <Text style={s.pillText}>{isoToDisplay(e.dateISO)}</Text>
                        </View>
                      )}

                      {(e.kind === "assessment" || e.kind === "exam") && typeof e.weight === "number" && (
                        <View style={s.pill}>
                          <Text style={s.pillText}>{clamp(e.weight, 0, 100).toFixed(0)}%</Text>
                        </View>
                      )}
                    </View>

                    {(e.notes ?? "").trim() !== "" && (
                      <Text style={[s.itemNotes, { color: theme.textMuted }]} numberOfLines={2}>
                        {e.notes}
                      </Text>
                    )}
                  </View>

                  <Pressable onPress={() => confirmDelete(e)} hitSlop={10} style={s.trashBtn}>
                    <Ionicons name="trash-outline" size={18} color="#fff" />
                  </Pressable>
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      {/* -------------------- Add modal -------------------- */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
            <View style={s.sheet}>
              <Text style={s.sheetTitle}>Add item</Text>
              <ScrollView keyboardShouldPersistTaps="handled">
                <PlannerItemForm
                  mode="add"
                  theme={theme}
                  s={s}
                  subjects={subjects}
                  onCancel={() => setShowAdd(false)}
                  onSave={async (payload) => {
                    await upsertTimelineEvent(payload);
                    await refreshTimeline();
                    setShowAdd(false);
                  }}
                />
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* -------------------- Edit modal -------------------- */}
      <Modal visible={showEdit} transparent animationType="slide" onRequestClose={() => setShowEdit(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
            <View style={s.sheet}>
              <Text style={s.sheetTitle}>Edit item</Text>
              <ScrollView keyboardShouldPersistTaps="handled">
                <PlannerItemForm
                  mode="edit"
                  theme={theme}
                  s={s}
                  subjects={subjects}
                  initial={editing ?? undefined}
                  onCancel={() => {
                    setShowEdit(false);
                    setEditing(null);
                  }}
                  onSave={async (payload) => {
                    await upsertTimelineEvent(payload);
                    await refreshTimeline();
                    setShowEdit(false);
                    setEditing(null);
                  }}
                  onDelete={
                    editing
                      ? async () => {
                          await removeTimelineEvent(editing.id);
                          await refreshTimeline();
                          setShowEdit(false);
                          setEditing(null);
                        }
                      : undefined
                  }
                />
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// -------------------------------
// Add/Edit form
// -------------------------------
function PlannerItemForm({
  mode,
  theme,
  s,
  subjects,
  initial,
  onCancel,
  onSave,
  onDelete,
}: {
  mode: "add" | "edit";
  theme: any;
  s: any;
  subjects: Subject[];
  initial?: TimelineEvent;
  onCancel: () => void;
  onSave: (e: TimelineEvent) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const now = Date.now();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState<TimelineKind>((initial?.kind as TimelineKind) ?? "todo");
  const [dateISO, setDateISO] = useState<string>(initial?.dateISO ?? isoToday());
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [subjectCode, setSubjectCode] = useState<string | undefined>(
    (initial?.subjectCode ?? "").trim() ? String(initial?.subjectCode).toUpperCase() : undefined
  );

  const [weightStr, setWeightStr] = useState<string>(
    typeof initial?.weight === "number" && Number.isFinite(initial.weight) ? String(initial.weight) : ""
  );

  const [isComplete, setIsComplete] = useState<boolean>(!!initial?.isComplete);
  const [pickerOpen, setPickerOpen] = useState(false);

  const kindOptions: TimelineKind[] = ["assessment", "exam", "lecture", "holiday", "todo", "custom"];
  const showWeight = kind === "assessment" || kind === "exam";

  function buildEvent(): TimelineEvent {
    const weightNum = showWeight && weightStr.trim() !== "" ? clamp(toNum(weightStr.trim()), 0, 100) : undefined;

    return {
      id: initial?.id ?? `t:${Date.now()}`,
      title: title.trim() || (kind === "todo" ? "Todo" : "Untitled"),
      dateISO: dateISO.trim() || isoToday(),
      kind,
      subjectCode: subjectCode ? subjectCode.toUpperCase() : undefined,
      weight: typeof weightNum === "number" && Number.isFinite(weightNum) ? weightNum : undefined,
      isComplete: isComplete ? true : false,
      notes: notes.trim() || undefined,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
  }

  function submit() {
    if (!title.trim()) {
      Alert.alert("Title required", "Please enter a title.");
      return;
    }
    onSave(buildEvent());
  }

  const dateDisplay = isoToDisplay(dateISO);

  return (
    <View style={{ paddingBottom: 10 }}>
      <View style={{ marginBottom: 12 }}>
        <Text style={s.label}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={kind === "todo" ? "e.g. Do practice quiz" : "e.g. Assignment 1"}
          placeholderTextColor={theme.textMuted}
          style={s.input}
        />
      </View>

      <View style={{ marginBottom: 12 }}>
        <Text style={s.label}>Type</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {kindOptions.map((k) => {
            const active = kind === k;
            return (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                style={[s.chip, active && [s.chipActive, { borderColor: theme.primary }]]}
              >
                <Text style={[s.chipText, active && { color: theme.primary }]}>{k}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ marginBottom: 12 }}>
        <Text style={s.label}>Due date</Text>

        <View style={s.inputWrap}>
          <Pressable onPress={() => setPickerOpen(true)} style={[s.input, s.inputWithIcon, { justifyContent: "center" }]}>
            <Text style={{ color: dateDisplay ? theme.text : theme.textMuted, fontSize: 16, fontWeight: "700" }}>
              {dateDisplay || "Select date (DD-MMM-YYYY)"}
            </Text>
          </Pressable>

          <Pressable onPress={() => setDateISO(isoToday())} hitSlop={10} style={s.inlineIcon}>
            <Ionicons name="refresh-outline" size={18} color={theme.textMuted} />
          </Pressable>
        </View>

        <DatePickerModal
          visible={pickerOpen}
          initialISO={dateISO}
          theme={theme}
          onCancel={() => setPickerOpen(false)}
          onConfirm={(iso) => {
            setDateISO(iso);
            setPickerOpen(false);
          }}
        />
      </View>

      <View style={{ marginBottom: 12 }}>
        <Text style={s.label}>Subject code (optional)</Text>
        <SubjectCodePicker subjects={subjects} value={subjectCode} onChange={setSubjectCode} theme={theme} s={s} />
      </View>

      {showWeight && (
        <View style={{ marginBottom: 12 }}>
          <Text style={s.label}>Weight % (optional)</Text>
          <TextInput
            value={weightStr}
            onChangeText={(t) => setWeightStr(t.replace(/[^0-9.]/g, ""))}
            placeholder="e.g. 20"
            placeholderTextColor={theme.textMuted}
            keyboardType={Platform.OS === "ios" ? "decimal-pad" : "number-pad"}
            inputMode="decimal"
            style={s.input}
          />
          <Text style={[s.helperText, { color: theme.textMuted, marginTop: 6 }]}>
            Planner does not show grade inputs. Use the Grade Planner per subject for marks.
          </Text>
        </View>
      )}

      <View style={{ marginBottom: 12 }}>
        <Pressable
          onPress={() => setIsComplete((p) => !p)}
          style={[
            s.completeRow,
            {
              borderColor: isComplete ? theme.success : theme.border,
              backgroundColor: theme.card,
            },
          ]}
        >
          <Ionicons
            name={isComplete ? "checkbox-outline" : "square-outline"}
            size={22}
            color={isComplete ? theme.success : theme.textMuted}
          />
          <Text style={[s.completeText, { color: isComplete ? theme.success : theme.textMuted }]}>
            {isComplete ? "Marked as complete" : "Mark as complete"}
          </Text>
        </Pressable>

        <Text style={[s.helperText, { color: theme.textMuted, marginTop: 6 }]}>
          Tip: You can mark assessments complete even if you don’t have a grade yet.
        </Text>
      </View>

      <View style={{ marginBottom: 16 }}>
        <Text style={s.label}>Notes (optional)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Any extra details…"
          placeholderTextColor={theme.textMuted}
          style={[s.input, { minHeight: 92, textAlignVertical: "top" }]}
          multiline
        />
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
        <Pressable onPress={onCancel} style={[s.btn, { backgroundColor: theme.border }]}>
          <Text style={[s.btnText, { color: theme.text }]}>Cancel</Text>
        </Pressable>

        <Pressable onPress={submit} style={[s.btn, { backgroundColor: theme.primary }]}>
          <Text style={[s.btnText, { color: theme.primaryText }]}>{mode === "add" ? "Add" : "Save"}</Text>
        </Pressable>
      </View>

      {mode === "edit" && onDelete && (
        <Pressable
          onPress={() => {
            Alert.alert("Delete item", "Are you sure you want to delete this item?", [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: () => onDelete() },
            ]);
          }}
          style={[s.deleteBtn]}
        >
          <Ionicons name="trash-outline" size={18} color="#fff" />
          <Text style={[s.deleteText]}>Delete</Text>
        </Pressable>
      )}
    </View>
  );
}

// -------------------------------
// Styles
// -------------------------------
const makeStyles = (t: ReturnType<typeof useTheme>["theme"]) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },

    headerCard: {
      borderRadius: 18,
      padding: 14,
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
    },
    headerTitle: { color: t.text, fontSize: 18, fontWeight: "900" },
    headerSubtitle: { color: t.textMuted, fontSize: 12, marginTop: 4 },

    primaryBtn: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 12,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
    },
    primaryBtnText: { fontWeight: "900" },

    toggleBtn: {
      flex: 1,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 12,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      borderWidth: 1,
    },
    toggleBtnText: { fontWeight: "900", fontSize: 12 },

    emptyCard: {
      borderRadius: 18,
      padding: 16,
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
    },
    emptyTitle: { color: t.text, fontWeight: "900", fontSize: 16, marginBottom: 6 },
    emptyText: { color: t.textMuted, fontSize: 13, lineHeight: 18 },

    itemCard: {
      borderRadius: 18,
      padding: 14,
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
    },
    itemTitle: { color: t.text, fontWeight: "900", fontSize: 15 },

    itemNotes: { marginTop: 8, fontSize: 12, lineHeight: 16 },

    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.card,
    },
    pillText: { color: t.textMuted, fontSize: 12, fontWeight: "800" },

    checkbox: { paddingTop: 2 },

    trashBtn: {
      width: 32,
      height: 32,
      borderRadius: 999,
      backgroundColor: "#E25563",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },

    sheet: {
      width: "100%",
      backgroundColor: t.bg,
      borderTopColor: t.border,
      borderTopWidth: 1,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 16,
      maxHeight: "85%",
    },
    sheetTitle: { color: t.text, fontSize: 18, fontWeight: "900", marginBottom: 12 },

    label: { color: t.textMuted, fontSize: 12, marginBottom: 6, fontWeight: "700" },

    helperText: { fontSize: 12, lineHeight: 16 },

    inputWrap: { position: "relative", width: "100%" },

    input: {
      color: t.text,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: Platform.select({ ios: 12, android: 10 }),
      backgroundColor: t.card,
      fontSize: 16,
    },
    inputWithIcon: { paddingRight: 44 },

    inlineIcon: {
      position: "absolute",
      right: 10,
      top: "50%",
      transform: [{ translateY: -11 }],
      width: 28,
      height: 28,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },

    chip: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
      alignSelf: "flex-start",
      backgroundColor: t.card,
    },
    chipActive: { backgroundColor: t.bg },
    chipText: { fontSize: 12, color: t.textMuted, fontWeight: "900" },

    completeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 1,
    },
    completeText: { fontWeight: "900" },

    btn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
    btnText: { fontWeight: "900" },

    deleteBtn: {
      marginTop: 6,
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      backgroundColor: "#E25563",
    },
    deleteText: { color: "#fff", fontWeight: "900" },
  });
