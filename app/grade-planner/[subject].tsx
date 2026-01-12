// app/grade-planner/[subject].tsx

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useNavigation } from "expo-router";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
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
import DraggableFlatList, { RenderItemParams } from "react-native-draggable-flatlist";
import { Swipeable } from "react-native-gesture-handler";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeProvider";

import { TIMELINE_KEY } from "../../_lib/timelineStorageKey";
import { TimelineEvent } from "../../_lib/timelineTypes";

// -------------------------------
// Types and helpers
// -------------------------------
export type Assessment = {
  id: string;
  name: string;
  weight: string;
  grade?: string;
  type?: "Assignment" | "Exam" | "Quiz" | "Other";
  hurdle?: boolean;

  // Stored as ISO YYYY-MM-DD, displayed as DD-MMM-YYYY
  dueDateISO?: string;
};

const seed: Assessment[] = [
  { id: "a1", name: "Assignment 1", weight: "20", grade: "", type: "Assignment" },
  { id: "a2", name: "Assignment 2", weight: "30", grade: "", type: "Assignment" },
  { id: "exam", name: "Exam", weight: "50", grade: "", type: "Exam" },
];

const SUBJECTS_LIST_KEY = "subjects-list:v1";

function toNum(s?: string) {
  const n = Number((s ?? "").toString().replace(/,/g, "."));
  return Number.isNaN(n) ? 0 : n;
}
function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}
function approxEqual(a: number, b: number, eps = 0.05) {
  return Math.abs(a - b) <= eps;
}
function fmt1(n: number) {
  return n.toFixed(1);
}

/** ========= Date utils (ISO storage, DD-MMM-YYYY display) ========= **/

const MMM = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function dateObjToISO(d: Date) {
  // Local date to ISO (no timezone shifting)
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

function isoToDateObj(iso?: string) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
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

/** ========= Date picker modal (cross-platform) ========= **/

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

  // Android: picker usually acts like a dialog; onChange fires with "set/dismissed"
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

  // iOS: wrap in our own modal with Done/Cancel
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

/** ========= Timeline Sync ========= **/

function makeEventId(subjectCode: string, assessmentId: string) {
  return `ev:${subjectCode.toUpperCase()}:${assessmentId}`;
}

function assessmentKindToTimelineKind(t?: Assessment["type"]): TimelineEvent["kind"] {
  return t === "Exam" ? "exam" : "assessment";
}

async function syncPlannerToTimeline(subjectCode: string, items: Assessment[]) {
  try {
    const raw = await AsyncStorage.getItem(TIMELINE_KEY);
    const existing: TimelineEvent[] = raw ? (JSON.parse(raw) as TimelineEvent[]) : [];

    const prefix = `ev:${subjectCode.toUpperCase()}:`;
    let next = existing.filter((e) => !(typeof e.id === "string" && e.id.startsWith(prefix)));

    const now = Date.now();

    const generated: TimelineEvent[] = items
      .filter((a) => (a.dueDateISO ?? "").trim() !== "")
      .map((a) => {
        const weightNum = clamp(toNum(a.weight), 0, 100);
        const gradeNum = (a.grade ?? "").trim() !== "" ? clamp(toNum(a.grade ?? ""), 0, 100) : undefined;

        const ev: TimelineEvent = {
          id: makeEventId(subjectCode, a.id),
          title: a.name.trim() || "Assessment",
          dateISO: (a.dueDateISO ?? "").trim(),
          kind: assessmentKindToTimelineKind(a.type),
          subjectCode: subjectCode.toUpperCase(),
          weight: Number.isFinite(weightNum) ? weightNum : undefined,
          grade: typeof gradeNum === "number" && Number.isFinite(gradeNum) ? gradeNum : undefined,
          createdAt: now,
          updatedAt: now,
        };

        return ev;
      });

    next = [...generated, ...next];
    await AsyncStorage.setItem(TIMELINE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

async function upsertFinalMarkForSubject(code: string, finalMark?: number) {
  try {
    const raw = await AsyncStorage.getItem(SUBJECTS_LIST_KEY);
    const list = raw ? (JSON.parse(raw) as any[]) : [];

    const next = list.map((s) => {
      const sCode = String(s?.code ?? "").toUpperCase();
      if (sCode !== code.toUpperCase()) return s;

      if (typeof finalMark === "number" && Number.isFinite(finalMark)) {
        return { ...s, finalMark };
      } else {
        const { finalMark: _remove, ...rest } = s ?? {};
        return rest;
      }
    });

    await AsyncStorage.setItem(SUBJECTS_LIST_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

// -------------------------------
// Reusable input with an inline clear (trash) button
// -------------------------------
function InlineClearInput({
  value,
  onChangeText,
  placeholder,
  placeholderTextColor,
  keyboardType,
  inputMode,
  returnKeyType,
  blurOnSubmit,
  onSubmitEditing,
  onFocus,
  onBlur,
  wrapStyle,
  inputStyle,
  clearEnabled,
  onClear,
  theme,
  s,
  iconSize = 18,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  keyboardType?: any;
  inputMode?: any;
  returnKeyType?: any;
  blurOnSubmit?: boolean;
  onSubmitEditing?: any;
  onFocus?: () => void;
  onBlur?: () => void;
  wrapStyle?: any;
  inputStyle?: any;
  clearEnabled: boolean;
  onClear: () => void;
  theme: any;
  s: any;
  iconSize?: number;
}) {
  return (
    <View style={[s.inputWrap, wrapStyle]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        keyboardType={keyboardType}
        inputMode={inputMode}
        returnKeyType={returnKeyType}
        blurOnSubmit={blurOnSubmit}
        onSubmitEditing={onSubmitEditing}
        onFocus={onFocus}
        onBlur={onBlur}
        style={[s.input, s.inputWithIcon, inputStyle]}
      />

      <Pressable
        onPress={onClear}
        disabled={!clearEnabled}
        hitSlop={10}
        style={[s.inlineTrash, { opacity: clearEnabled ? 1 : 0.25 }]}
      >
        <Ionicons name="trash-outline" size={iconSize} color={theme.textMuted} />
      </Pressable>
    </View>
  );
}

// -------------------------------
// Main component
// -------------------------------
export default function SubjectPlannerScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const { subject } = useLocalSearchParams<{ subject: string }>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();

  const code = decodeURIComponent(subject ?? "").toUpperCase();
  const STORAGE_KEY = `grade-planner:${code}`;

  const [items, setItems] = useState<Assessment[]>(seed);
  const [targetPass, setTargetPass] = useState<number>(50);

  const [finalSubjectGrade, setFinalSubjectGrade] = useState<string>("");
  const [autoCalcExamFromFinal, setAutoCalcExamFromFinal] = useState<boolean>(true);

  const [finalGradeShowRangeWarning, setFinalGradeShowRangeWarning] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [footerH, setFooterH] = useState(72);

  useLayoutEffect(() => {
    nav.setOptions({
      title: `Grade Planner • ${code}`,
      headerStyle: { backgroundColor: theme.navBg },
      headerTintColor: theme.navText,
      headerTitleStyle: { color: theme.navText },
    });
  }, [nav, code, theme]);

  // Load saved planner
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.items)) setItems(parsed.items);
          if (typeof parsed.targetPass === "number") setTargetPass(parsed.targetPass);
          if (typeof parsed.finalSubjectGrade === "string") setFinalSubjectGrade(parsed.finalSubjectGrade);
          if (typeof parsed.autoCalcExamFromFinal === "boolean") setAutoCalcExamFromFinal(parsed.autoCalcExamFromFinal);
        }
      } catch {
        // ignore
      }
    })();
  }, [STORAGE_KEY]);

  // Persist + Sync to timeline
  useEffect(() => {
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        items,
        targetPass,
        finalSubjectGrade,
        autoCalcExamFromFinal,
      })
    ).catch(() => {});

    if (code) syncPlannerToTimeline(code, items);
  }, [items, targetPass, finalSubjectGrade, autoCalcExamFromFinal, STORAGE_KEY, code]);

  // -------------------------------
  // Stats + hurdle + exam solve
  // -------------------------------
  const {
    sumContribution,
    totalWeight,
    remainingWeight,
    finalMin,
    finalMax,
    requiredOnRemaining,
    anyHurdleFailed,
    anyHurdleMissing,
    finalGradeNumeric,
    canAutoCalcExam,
    requiredExamToHitFinal,
    examIdx,
    examWeight,
    otherAnyMissingForAutoCalc,
    otherContributionForAutoCalc,
  } = useMemo(() => {
    let totalWeight = 0;
    let completedWeight = 0;
    let contributions = 0;

    for (const i of items) {
      const w = clamp(toNum(i.weight));
      totalWeight += w;

      const hasGrade = i.grade !== undefined && i.grade !== "";
      if (hasGrade) {
        const g = clamp(toNum(i.grade));
        completedWeight += w;
        contributions += (w * g) / 100;
      }
    }

    const sumContribution = contributions;
    const remainingWeightRaw = 100 - completedWeight;
    const remainingWeight = clamp(remainingWeightRaw, 0, 100);

    const accumulated = clamp(sumContribution, 0, 100);
    const finalMin = accumulated;
    const finalMax = clamp(accumulated + remainingWeight, 0, 100);

    const hurdles = items.filter((i) => i.hurdle);
    const anyHurdleFailed = hurdles.some((i) => {
      if (i.grade === undefined || i.grade === "") return false;
      const g = clamp(toNum(i.grade));
      return g < 50;
    });
    const anyHurdleMissing = hurdles.some((i) => i.grade === undefined || i.grade === "");

    let requiredOnRemaining: number | null = null;
    if (remainingWeight > 0) {
      requiredOnRemaining = ((targetPass - sumContribution) / remainingWeight) * 100;
    }

    const finalGradeNumeric = finalSubjectGrade.trim() !== "" ? clamp(toNum(finalSubjectGrade), 0, 100) : null;

    const examIdx = items.findIndex((x) => x.type === "Exam");
    const examItem = examIdx >= 0 ? items[examIdx] : null;
    const examWeight = examItem ? clamp(toNum(examItem.weight), 0, 100) : 0;

    let otherContribution = 0;
    let otherAnyMissing = false;

    for (const i of items) {
      if (i.type === "Exam") continue;
      const w = clamp(toNum(i.weight), 0, 100);

      const hasGrade = i.grade !== undefined && i.grade !== "";
      if (hasGrade) {
        const g = clamp(toNum(i.grade), 0, 100);
        otherContribution += (w * g) / 100;
      } else if (w > 0) {
        otherAnyMissing = true;
      }
    }

    const canAutoCalcExam = finalGradeNumeric != null && examItem != null && examWeight > 0 && !otherAnyMissing;

    let requiredExamToHitFinal: number | null = null;
    if (canAutoCalcExam && finalGradeNumeric != null) {
      requiredExamToHitFinal = ((finalGradeNumeric - otherContribution) / examWeight) * 100;
      requiredExamToHitFinal = clamp(requiredExamToHitFinal, 0, 100);
    }

    return {
      sumContribution,
      totalWeight,
      remainingWeight,
      finalMin,
      finalMax,
      requiredOnRemaining,
      anyHurdleFailed,
      anyHurdleMissing,
      finalGradeNumeric,
      canAutoCalcExam,
      requiredExamToHitFinal,
      examIdx,
      examWeight,
      otherAnyMissingForAutoCalc: otherAnyMissing,
      otherContributionForAutoCalc: otherContribution,
    };
  }, [items, targetPass, finalSubjectGrade]);

  const isPerfect = Math.abs(totalWeight - 100) < 0.01;
  const hasRemaining = remainingWeight > 0.01;

  const alreadyPassed = !anyHurdleFailed && !anyHurdleMissing && finalMin >= targetPass;
  const impossibleToPassByMarks = finalMax < targetPass && hasRemaining;

  const requiredDisplay = requiredOnRemaining != null ? Math.max(0, Math.min(100, requiredOnRemaining)) : null;

  const finalOutOfRange =
    finalGradeNumeric != null && (finalGradeNumeric < finalMin - 0.05 || finalGradeNumeric > finalMax + 0.05);

  // -------------------------------
  // Mutations
  // -------------------------------
  function updateItem(id: string, patch: Partial<Assessment>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function clearItemGrade(id: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, grade: "" } : it)));
  }

  function clearItemDueDate(id: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, dueDateISO: undefined } : it)));
  }

  function addItem(newItem: Assessment) {
    setItems((prev) => [...prev, newItem]);
  }

  function handleReorder(data: Assessment[]) {
    setItems(data);
  }

  function toggleAutoCalc() {
    if (autoCalcExamFromFinal) {
      setAutoCalcExamFromFinal(false);

      setItems((prev) => {
        const idx = prev.findIndex((x) => x.type === "Exam");
        if (idx < 0) return prev;
        const exam = prev[idx];
        if (!exam) return prev;
        if ((exam.grade ?? "") === "") return prev;

        const next = [...prev];
        next[idx] = { ...exam, grade: "" };
        return next;
      });
    } else {
      setAutoCalcExamFromFinal(true);
    }
  }

  useEffect(() => {
    if (!autoCalcExamFromFinal) return;
    if (finalSubjectGrade.trim() !== "") return;

    setItems((prev) => {
      const idx = prev.findIndex((x) => x.type === "Exam");
      if (idx < 0) return prev;
      const exam = prev[idx];
      if (!exam) return prev;
      if ((exam.grade ?? "") === "") return prev;

      const next = [...prev];
      next[idx] = { ...exam, grade: "" };
      return next;
    });
  }, [finalSubjectGrade, autoCalcExamFromFinal]);

  useEffect(() => {
    if (!autoCalcExamFromFinal) return;
    if (!canAutoCalcExam) return;
    if (requiredExamToHitFinal == null) return;
    if (examIdx < 0) return;

    setItems((prev) => {
      const current = prev[examIdx];
      if (!current) return prev;

      const currentGrade = current.grade ?? "";
      const currentNum = currentGrade === "" ? null : clamp(toNum(currentGrade), 0, 100);

      const nextNum = clamp(requiredExamToHitFinal, 0, 100);

      if (currentNum != null && approxEqual(currentNum, nextNum)) return prev;

      const next = [...prev];
      next[examIdx] = { ...current, grade: nextNum.toFixed(1) };
      return next;
    });
  }, [autoCalcExamFromFinal, canAutoCalcExam, requiredExamToHitFinal, examIdx]);

  useEffect(() => {
    const finalFromManual = finalGradeNumeric != null && Number.isFinite(finalGradeNumeric);
    const finalFromAssessments = isPerfect && remainingWeight <= 0.01 && !anyHurdleFailed;

    if (finalFromManual) {
      upsertFinalMarkForSubject(code, clamp(finalGradeNumeric!, 0, 100));
      return;
    }

    if (finalFromAssessments) {
      upsertFinalMarkForSubject(code, clamp(finalMin, 0, 100));
      return;
    }

    upsertFinalMarkForSubject(code, undefined);
  }, [code, finalGradeNumeric, isPerfect, remainingWeight, anyHurdleFailed, finalMin]);

  async function confirmRemoveSubject() {
    Alert.alert("Remove subject", `Remove ${code} from your subjects list and delete its grade planner?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            const saved = await AsyncStorage.getItem(SUBJECTS_LIST_KEY);
            if (saved) {
              const list = JSON.parse(saved) as { code: string; name: string; finalMark?: number }[];
              const updated = list.filter((s) => s.code.toUpperCase() !== code);
              await AsyncStorage.setItem(SUBJECTS_LIST_KEY, JSON.stringify(updated));
            }
            await AsyncStorage.removeItem(STORAGE_KEY);
            // @ts-ignore
            nav.goBack();
          } catch {
            Alert.alert("Error", "Something went wrong while removing the subject.");
          }
        },
      },
    ]);
  }

  const listBottomPad = insets.bottom + footerH + 24;

  const Footer = (
    <View
      style={[s.footer, { paddingBottom: insets.bottom + 8 }]}
      onLayout={(e: LayoutChangeEvent) => setFooterH(e.nativeEvent.layout.height)}
    >
      <View style={s.bottomRowEven}>
        <View style={s.bottomItem}>
          <Pressable onPress={() => setShowAdd(true)} style={[s.primaryBtn, s.fullWidthBtn, { backgroundColor: theme.primary }]}>
            <Text style={[s.primaryBtnText, { color: theme.primaryText }]}>Add item</Text>
          </Pressable>
        </View>
      </View>

      <View style={[s.bottomRowEven, { marginTop: 12 }]}>
        <View style={s.bottomItem}>
          <View
            style={[
              s.weightPill,
              {
                borderColor: isPerfect ? theme.success : theme.danger,
                backgroundColor: theme.card,
              },
            ]}
          >
            <Text style={[s.weightPillText, { color: isPerfect ? theme.success : theme.danger }]}>
              {isPerfect ? `Total weighting = 100%` : `Total weighting = ${totalWeight.toFixed(1)}%`}
            </Text>
          </View>
        </View>

        <View style={[s.bottomItem, { alignItems: "flex-end" }]}>
          <Pressable onPress={confirmRemoveSubject} style={s.removeSubjectBtn}>
            <Text style={s.removeSubjectText}>Remove subject</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  const renderItem = ({ item, drag, isActive }: RenderItemParams<Assessment>) => (
    <AssessmentRow
      item={item}
      drag={drag}
      isActive={isActive}
      theme={theme}
      s={s}
      updateItem={updateItem}
      removeItem={removeItem}
      clearItemGrade={clearItemGrade}
      clearItemDueDate={clearItemDueDate}
    />
  );

  const officialFinalDisplay = finalGradeNumeric != null ? finalGradeNumeric.toFixed(1) : sumContribution.toFixed(1);

  const showFinalRangeWarning = finalGradeShowRangeWarning && finalOutOfRange;

  const autoCalcHelper = autoCalcExamFromFinal
    ? finalSubjectGrade.trim() === ""
      ? "Enter a final subject grade to auto-calc the exam (if possible)."
      : !canAutoCalcExam
      ? "To auto-calc, ensure grades exist for all non-exam items and the Exam weight is > 0."
      : "Auto-calc is active — the Exam grade will be updated to match the final subject grade."
    : "Auto-calc is off — you can manually enter the exam grade (and/or final subject grade).";

  const autoCalcWarning = autoCalcExamFromFinal
    ? "Disabling this will remove the current grade for the final exam."
    : "Tip: turn this back on if you want the app to solve the exam mark from your final subject grade (when possible).";

  return (
    <SafeAreaView style={[s.screen]} edges={["top", "bottom", "left", "right"]}>
      <DraggableFlatList<Assessment>
        data={items}
        keyExtractor={(i) => i.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: listBottomPad }}
        renderItem={renderItem}
        onDragEnd={({ data }) => handleReorder(data)}
        ListHeaderComponent={
          <View style={{ rowGap: 12 }}>
            <View style={s.banner}>
              <Text style={s.bannerLabel}>Subject snapshot</Text>

              <Text style={s.bannerValue}>{officialFinalDisplay}%</Text>
              <Text style={s.bannerCaption}>{finalGradeNumeric != null ? "Final subject grade (manual)" : "Accumulated so far"}</Text>

              <View style={s.bannerDivider} />

              <View style={s.bannerRow}>
                <Text style={s.bannerStatLabel}>Remaining weight</Text>
                <Text style={s.bannerStatValue}>{remainingWeight.toFixed(1)}%</Text>
              </View>

              <View style={s.bannerRow}>
                <Text style={s.bannerStatLabel}>Possible final range</Text>
                <Text style={s.bannerStatValue}>{`${Math.round(finalMin)}% – ${Math.round(finalMax)}%`}</Text>
              </View>

              <View style={s.bannerRow}>
                <Text style={s.bannerStatLabel}>Pass mark</Text>
                <InlineClearInput
                  value={String(Math.round(targetPass))}
                  onChangeText={(t) => {
                    const cleaned = t.replace(/[^0-9.]/g, "");
                    const num = clamp(toNum(cleaned), 0, 100);
                    setTargetPass(num);
                  }}
                  keyboardType={Platform.OS === "ios" ? "decimal-pad" : "number-pad"}
                  inputMode="decimal"
                  placeholder="50"
                  placeholderTextColor={theme.textMuted}
                  clearEnabled={targetPass !== 50}
                  onClear={() => setTargetPass(50)}
                  theme={theme}
                  s={s}
                  wrapStyle={s.topInputRight}
                  inputStyle={s.topInputFieldRight}
                />
              </View>

              <View style={s.bannerRow}>
                <Text style={s.bannerStatLabel}>Final subject grade</Text>
                <InlineClearInput
                  value={finalSubjectGrade}
                  onChangeText={(t) => {
                    setFinalGradeShowRangeWarning(false);
                    setFinalSubjectGrade(t.replace(/[^0-9.]/g, ""));
                  }}
                  onFocus={() => setFinalGradeShowRangeWarning(false)}
                  onBlur={() => setFinalGradeShowRangeWarning(true)}
                  keyboardType={Platform.OS === "ios" ? "decimal-pad" : "number-pad"}
                  inputMode="decimal"
                  placeholder="(optional)"
                  placeholderTextColor={theme.textMuted}
                  clearEnabled={finalSubjectGrade.trim() !== ""}
                  onClear={() => {
                    setFinalGradeShowRangeWarning(false);
                    setFinalSubjectGrade("");
                  }}
                  theme={theme}
                  s={s}
                  wrapStyle={s.topInputRight}
                  inputStyle={[
                    s.topInputFieldRight,
                    showFinalRangeWarning ? { color: theme.danger, borderColor: theme.danger } : null,
                  ]}
                />
              </View>

              {showFinalRangeWarning && (
                <Text style={[s.helperText, { color: theme.danger, marginTop: 6 }]}>
                  This value is outside your possible final range ({Math.round(finalMin)}% – {Math.round(finalMax)}%).
                  Check your inputs or weighting.
                </Text>
              )}

              <View style={{ marginTop: 10 }}>
                <Pressable
                  onPress={toggleAutoCalc}
                  style={[
                    s.togglePill,
                    {
                      borderColor: autoCalcExamFromFinal ? theme.primary : theme.border,
                      backgroundColor: theme.card,
                    },
                  ]}
                >
                  <Text style={[s.toggleText, { color: autoCalcExamFromFinal ? theme.primary : theme.textMuted }]}>
                    {autoCalcExamFromFinal ? "Auto-calc Exam from Final grade ✓" : "Auto-calc Exam from Final grade"}
                  </Text>
                </Pressable>

                <Text style={[s.helperText, { color: theme.textMuted, marginTop: 6 }]}>{autoCalcHelper}</Text>

                <Text style={[s.helperText, { color: autoCalcExamFromFinal ? theme.danger : theme.textMuted, marginTop: 6 }]}>
                  {autoCalcWarning}
                </Text>

                {autoCalcExamFromFinal && finalSubjectGrade.trim() !== "" && !canAutoCalcExam && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={[s.helperText, { color: theme.textMuted }]}>
                      Auto-calc needs:
                      {"\n"}• An Exam item (Type = Exam) with weight &gt; 0
                      {"\n"}• Grades entered for all non-exam items with weight &gt; 0
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={s.passCard}>
              <Text style={s.passTitle}>What do I need to pass?</Text>
              <Text style={s.passSubtitle}>Pass mark set to {Math.round(targetPass)}% overall.</Text>

              {anyHurdleFailed ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={s.passText}>⚠️ One or more hurdle tasks are currently below 50%.</Text>
                  <Text style={s.passText}>
                    Even if your overall mark reaches {Math.round(targetPass)}%, failing a hurdle usually means you
                    cannot pass the subject.
                  </Text>
                </View>
              ) : impossibleToPassByMarks ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={s.passText}>
                    Even with 100% in the remaining {remainingWeight.toFixed(1)}%, your final mark would only reach about{" "}
                    {finalMax.toFixed(1)}%.
                  </Text>
                  <Text style={s.passText}>That’s below the {Math.round(targetPass)}% pass mark.</Text>
                </View>
              ) : !hasRemaining ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={s.passText}>There’s no remaining weighting left in this subject.</Text>
                  <Text style={s.passText}>Your final mark is approximately {finalMin.toFixed(1)}%.</Text>
                </View>
              ) : alreadyPassed ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={s.passText}>
                    🎉 Based on your current results, you’ve already reached the {Math.round(targetPass)}% pass mark.
                  </Text>
                </View>
              ) : (
                <View style={{ marginTop: 8 }}>
                  <Text style={s.passText}>
                    To reach {Math.round(targetPass)}% overall, you need an average of{" "}
                    <Text style={s.passHighlight}>{requiredDisplay?.toFixed(1)}%</Text> across your remaining{" "}
                    {remainingWeight.toFixed(1)}% weighting.
                  </Text>
                </View>
              )}
            </View>

            <View style={s.passCard}>
              <Text style={s.passTitle}>Exam calculator</Text>
              <Text style={s.passSubtitle}>Quick view based on your current inputs.</Text>

              <View style={{ marginTop: 10 }}>
                <Text style={s.passText}>
                  Exam weight: <Text style={{ fontWeight: "700" }}>{fmt1(examWeight)}%</Text>
                </Text>

                {finalSubjectGrade.trim() === "" ? (
                  <Text style={[s.passText, { marginTop: 6 }]}>
                    Add a final subject grade (optional) to solve what your exam result would have been (when possible).
                  </Text>
                ) : otherAnyMissingForAutoCalc ? (
                  <Text style={[s.passText, { marginTop: 6 }]}>
                    To solve the exam from your final grade, add grades for all non-exam items with weight &gt; 0.
                  </Text>
                ) : requiredExamToHitFinal == null ? (
                  <Text style={[s.passText, { marginTop: 6 }]}>
                    Ensure you have an Exam item (Type = Exam) and it has a weight &gt; 0.
                  </Text>
                ) : (
                  <View style={{ marginTop: 6 }}>
                    <Text style={s.passText}>
                      Non-exam contribution so far:{" "}
                      <Text style={{ fontWeight: "700" }}>{fmt1(otherContributionForAutoCalc)}%</Text>
                    </Text>
                    <Text style={[s.passText, { marginTop: 6 }]}>
                      Exam needed to match final grade:{" "}
                      <Text style={{ fontWeight: "800" }}>{fmt1(requiredExamToHitFinal)}%</Text>
                    </Text>
                    <Text style={[s.passText, { marginTop: 6, color: theme.textMuted }]}>
                      (If auto-calc is enabled, this value is written into your Exam item automatically.)
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* ✅ NEW: swipe hint */}
            <Text style={[s.swipeHint, { color: theme.textMuted }]}>Swipe left to delete item</Text>
          </View>
        }
        ListFooterComponent={Footer}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }} edges={["top"]}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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
    </SafeAreaView>
  );
}

// -------------------------------
// Draggable Assessment Row
// -------------------------------
type RowProps = {
  item: Assessment;
  drag: () => void;
  isActive: boolean;
  theme: ReturnType<typeof useTheme>["theme"];
  s: ReturnType<typeof makeStyles>;
  updateItem: (id: string, patch: Partial<Assessment>) => void;
  removeItem: (id: string) => void;
  clearItemGrade: (id: string) => void;
  clearItemDueDate: (id: string) => void;
};

function AssessmentRow({
  item,
  drag,
  isActive,
  theme,
  s,
  updateItem,
  removeItem,
  clearItemGrade,
  clearItemDueDate,
}: RowProps) {
  const wobbleAnim = useRef(new Animated.Value(0)).current;
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let animation: Animated.CompositeAnimation | undefined;

    if (isActive) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(wobbleAnim, { toValue: -3, duration: 80, useNativeDriver: true }),
          Animated.timing(wobbleAnim, { toValue: 3, duration: 80, useNativeDriver: true }),
        ])
      );
      animation.start();
    } else {
      if (animation) animation.stop();
      wobbleAnim.stopAnimation();
      wobbleAnim.setValue(0);
    }

    return () => {
      if (animation) animation.stop();
      wobbleAnim.stopAnimation();
      wobbleAnim.setValue(0);
    };
  }, [isActive, wobbleAnim]);

  const animatedStyle = {
    transform: [{ translateX: wobbleAnim }, { scale: isActive ? 1.02 : 1 }],
    opacity: isActive ? 0.97 : 1,
  };

  const hasGrade = (item.grade ?? "").trim() !== "";
  const w = clamp(toNum(item.weight), 0, 100);
  const g = clamp(toNum(item.grade ?? ""), 0, 100);
  const contribution = hasGrade ? (w * g) / 100 : null;

  const dueDisplay = isoToDisplay(item.dueDateISO);

  // ✅ NEW: full-width red underlay + instant delete on swipe open
  const renderRightActions = () => (
    <View style={[s.deleteUnderlay]}>
      <Text style={s.deleteText}>Delete</Text>
    </View>
  );

  return (
    <View style={{ marginBottom: 0 }}>
      <Swipeable
        renderRightActions={renderRightActions}
        rightThreshold={72}
        friction={1.6}
        overshootRight={false}
        onSwipeableOpen={() => {
          // swipe + release => delete (no confirmation)
          removeItem(item.id);
        }}
      >
        <Animated.View style={[s.card, animatedStyle]}>
          <View style={s.cardHeaderRow}>
            <TextInput
              value={item.name}
              onChangeText={(t) => updateItem(item.id, { name: t })}
              placeholder="Assessment name"
              placeholderTextColor={theme.textMuted}
              style={[s.inputText, { flex: 1, marginRight: 8 }]}
              returnKeyType="next"
              blurOnSubmit={false}
            />
            <Pressable onLongPress={drag} delayLongPress={150} style={s.dragHandle} hitSlop={10}>
              <Text style={{ color: theme.textMuted, fontSize: 18 }}>≡</Text>
            </Pressable>
          </View>

          <View style={[s.row, { marginBottom: 8 }]}>
            {(["Assignment", "Exam", "Quiz"] as const).map((kind) => {
              const isActiveType = item.type === kind;
              return (
                <Pressable
                  key={kind}
                  onPress={() => updateItem(item.id, { type: kind })}
                  style={[s.typeChip, isActiveType && [s.typeChipActive, { borderColor: theme.primary }]]}
                >
                  <Text style={[s.typeChipText, isActiveType && { color: theme.primary }]}>{kind}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ marginBottom: 8 }}>
            <Pressable
              onPress={() => updateItem(item.id, { hurdle: !item.hurdle })}
              style={[s.hurdleChip, item.hurdle && [s.hurdleChipActive, { borderColor: "#E25563" }]]}
            >
              <Text style={[s.hurdleChipText, item.hurdle && { color: "#E25563" }]}>
                {item.hurdle ? "Hurdle requirement ✓" : "Hurdle requirement"}
              </Text>
            </Pressable>
          </View>

          {/* Due Date selector */}
          <View style={{ marginBottom: 12 }}>
            <Text style={s.label}>Due date</Text>

            <View style={s.inputWrap}>
              <Pressable onPress={() => setPickerOpen(true)} style={[s.input, s.inputWithIcon, { justifyContent: "center" }]}>
                <Text style={{ color: dueDisplay ? theme.text : theme.textMuted, fontSize: 16, fontWeight: "700" }}>
                  {dueDisplay || "Select date (DD-MMM-YYYY)"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => clearItemDueDate(item.id)}
                disabled={(item.dueDateISO ?? "").trim() === ""}
                hitSlop={10}
                style={[s.inlineTrash, { opacity: (item.dueDateISO ?? "").trim() ? 1 : 0.25 }]}
              >
                <Ionicons name="trash-outline" size={18} color={theme.textMuted} />
              </Pressable>
            </View>

            <Text style={[s.contribText, { color: theme.textMuted, marginTop: 6 }]}>
              Tip: this syncs into the Calendar tab automatically.
            </Text>

            <DatePickerModal
              visible={pickerOpen}
              initialISO={item.dueDateISO}
              theme={theme}
              onCancel={() => setPickerOpen(false)}
              onConfirm={(iso) => {
                updateItem(item.id, { dueDateISO: iso });
                setPickerOpen(false);
              }}
            />
          </View>

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

            <View style={{ width: 160, flexGrow: 1 }}>
              <Text style={s.label}>Grade %</Text>
              <InlineClearInput
                value={item.grade ?? ""}
                onChangeText={(t) => updateItem(item.id, { grade: t.replace(/[^0-9.]/g, "") })}
                keyboardType={Platform.OS === "ios" ? "decimal-pad" : "number-pad"}
                inputMode="decimal"
                placeholder="Result %"
                placeholderTextColor={theme.textMuted}
                clearEnabled={(item.grade ?? "").trim() !== ""}
                onClear={() => clearItemGrade(item.id)}
                theme={theme}
                s={s}
              />
            </View>
          </View>

          <View style={{ marginTop: 10 }}>
            <Text style={[s.contribText, { color: theme.textMuted }]}>
              Contribution to final:{" "}
              <Text style={{ color: theme.text, fontWeight: "700" }}>
                {contribution == null ? "—" : `${contribution.toFixed(1)}%`}
              </Text>
            </Text>
          </View>

          {/* ✅ REMOVED: trashcan delete button (now swipe-to-delete) */}
        </Animated.View>
      </Swipeable>
    </View>
  );
}

// -------------------------------
// Add-item modal form
// -------------------------------
function AddForm({
  onCancel,
  onAdd,
}: {
  onCancel: () => void;
  onAdd: (a: Assessment) => void;
}) {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [grade, setGrade] = useState("");
  const [type, setType] = useState<Assessment["type"]>("Assignment");
  const [hurdle, setHurdle] = useState<boolean>(false);

  const [dueISO, setDueISO] = useState<string | undefined>(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);

  const weightRef = useRef<TextInput>(null);
  const gradeRef = useRef<TextInput>(null);

  function submit() {
    if (!name.trim()) return Alert.alert("Name required");
    if (!weight.trim()) return Alert.alert("Weight % required");

    const id = `${Date.now()}`;

    onAdd({
      id,
      name: name.trim(),
      weight: weight.replace(/[^0-9.]/g, ""),
      grade: grade.replace(/[^0-9.]/g, ""),
      type: type ?? "Assignment",
      hurdle,
      dueDateISO: dueISO || undefined,
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

      <View style={[s.row, { marginBottom: 12 }]}>
        {(["Assignment", "Exam", "Quiz"] as const).map((kind) => {
          const isActive = type === kind;
          return (
            <Pressable
              key={kind}
              onPress={() => setType(kind)}
              style={[s.typeChip, isActive && [s.typeChipActive, { borderColor: theme.primary }]]}
            >
              <Text style={[s.typeChipText, isActive && { color: theme.primary }]}>{kind}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginBottom: 16 }}>
        <Pressable
          onPress={() => setHurdle((prev) => !prev)}
          style={[s.hurdleChip, hurdle && [s.hurdleChipActive, { borderColor: "#E25563" }]]}
        >
          <Text style={[s.hurdleChipText, hurdle && { color: "#E25563" }]}>
            {hurdle ? "Hurdle requirement ✓" : "Mark as hurdle requirement"}
          </Text>
        </Pressable>
      </View>

      {/*  Due Date selector */}
      <View style={{ marginBottom: 16 }}>
        <Text style={s.label}>Due date (optional)</Text>

        <View style={s.inputWrap}>
          <Pressable onPress={() => setPickerOpen(true)} style={[s.input, s.inputWithIcon, { justifyContent: "center" }]}>
            <Text style={{ color: dueISO ? theme.text : theme.textMuted, fontSize: 16, fontWeight: "700" }}>
              {dueISO ? isoToDisplay(dueISO) : "Select date (DD-MMM-YYYY)"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setDueISO(undefined)}
            disabled={!dueISO}
            hitSlop={10}
            style={[s.inlineTrash, { opacity: dueISO ? 1 : 0.25 }]}
          >
            <Ionicons name="trash-outline" size={18} color={theme.textMuted} />
          </Pressable>
        </View>

        <Text style={[s.contribText, { color: theme.textMuted, marginTop: 6 }]}>
          Once set, this will appear in the Calendar tab.
        </Text>

        <DatePickerModal
          visible={pickerOpen}
          initialISO={dueISO}
          theme={theme}
          onCancel={() => setPickerOpen(false)}
          onConfirm={(iso) => {
            setDueISO(iso);
            setPickerOpen(false);
          }}
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

// -------------------------------
// Styles
// -------------------------------
const makeStyles = (t: ReturnType<typeof useTheme>["theme"]) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },

    banner: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 18,
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
    },
    bannerLabel: {
      color: t.textMuted,
      fontSize: 12,
      fontWeight: "600",
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    bannerValue: { color: t.success, fontSize: 28, fontWeight: "800" },
    bannerCaption: { color: t.textMuted, fontSize: 12, marginTop: 2 },
    bannerDivider: { height: 1, backgroundColor: t.border, marginVertical: 10, opacity: 0.6 },

    bannerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 8,
      columnGap: 12,
    },
    bannerStatLabel: { color: t.textMuted, fontSize: 13 },
    bannerStatValue: { color: t.text, fontSize: 14, fontWeight: "600" },

    topInputRight: { width: 170, maxWidth: 170, alignSelf: "flex-end" },
    topInputFieldRight: { textAlign: "center", fontSize: 16 },

    togglePill: {
      borderWidth: 1,
      borderRadius: 999,
      paddingVertical: 10,
      paddingHorizontal: 12,
      alignSelf: "flex-start",
    },
    toggleText: { fontSize: 12, fontWeight: "800" },
    helperText: { marginTop: 6, fontSize: 12, lineHeight: 16 },

    passCard: {
      borderRadius: 18,
      padding: 14,
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
      marginBottom: 12,
    },
    passTitle: { color: t.text, fontSize: 15, fontWeight: "700", marginBottom: 2 },
    passSubtitle: { color: t.textMuted, fontSize: 12 },
    passText: { color: t.text, fontSize: 13, lineHeight: 18, marginTop: 2 },
    passHighlight: { fontWeight: "700", color: t.success },

    swipeHint: {
      fontSize: 12,
      fontWeight: "800",
      marginTop: 2,
      marginBottom: 4,
      textAlign: "left",
    },

    // ✅ swipe underlay
    deleteUnderlay: {
      flex: 1,
      backgroundColor: "#E25563",
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "flex-end",
      paddingRight: 18,
    },
    deleteText: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "900",
      letterSpacing: 0.2,
      textTransform: "uppercase",
    },

    card: {
      borderRadius: 16,
      padding: 16,
      paddingBottom: 18,
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
      position: "relative",
    },
    cardHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },

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

    inputText: { color: t.text, fontSize: 16 },
    label: { color: t.textMuted, fontSize: 12, marginBottom: 4 },
    row: { flexDirection: "row", columnGap: 12 },

    inlineTrash: {
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

    contribText: { fontSize: 12 },

    footer: {
      backgroundColor: t.navBg,
      borderTopColor: t.border,
      borderTopWidth: 1,
      paddingTop: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      marginTop: 12,
    },
    bottomRowEven: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      columnGap: 12,
    },
    bottomItem: { flex: 1 },
    fullWidthBtn: { width: "100%", alignItems: "center" },

    weightPill: {
      width: "100%",
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      backgroundColor: t.card,
      alignItems: "center",
      justifyContent: "center",
    },
    weightPillText: { fontSize: 14, fontWeight: "600", textAlign: "center" },

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

    primaryBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, alignItems: "center", flex: 1 },
    primaryBtnText: { fontWeight: "700" },

    neutralBtn: { flex: 1, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, alignItems: "center" },
    neutralBtnText: { color: t.text },

    removeSubjectBtn: {
      width: "100%",
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#E25563",
    },
    removeSubjectText: { color: "#fff", fontWeight: "700", fontSize: 14, textAlign: "center" },

    typeChip: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.card,
    },
    typeChipActive: { backgroundColor: t.bg },
    typeChipText: { fontSize: 12, color: t.textMuted, fontWeight: "600" },

    hurdleChip: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
      alignSelf: "flex-start",
      backgroundColor: t.card,
    },
    hurdleChipActive: { backgroundColor: t.bg },
    hurdleChipText: { fontSize: 12, color: t.textMuted, fontWeight: "600" },

    dragHandle: { paddingHorizontal: 4, paddingVertical: 4, marginLeft: 4 },
  });
