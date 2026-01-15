// app/(tabs)/index.tsx
//

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
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
import { Swipeable, RectButton } from "react-native-gesture-handler";
import { useTheme } from "../../theme/ThemeProvider";

/** ---------- Types ---------- */

type PeriodType = "Semester" | "Trimester" | "Term";
type TagKey = "core" | "major" | "minor" | "elective" | "custom";

type Commencement = {
  year: number; // e.g. 2027
  type: PeriodType; // Semester/Trimester/Term
  num: number; // 1..4
};

type Subject = {
  code: string;
  name: string;

  finalMark?: number; // 0-100

  isExempt?: boolean; // RPL/credit
  exemptFinalMark?: number; // optional grade for exempt subject

  commencement?: Commencement;
  tagKey?: TagKey;
  tagLabel?: string;

  manualOrder?: boolean;
};

/** ---------- Storage keys ---------- */

const STORAGE_KEY = "subjects-list:v1";

const FIRST_OPEN_KEY = "meta:first-open-at";
const FEEDBACK_PROMPTED_KEY = "meta:feedback-prompted";
const FEEDBACK_SNOOZE_KEY = "meta:feedback-snooze-at";

const TUTORIAL_SEEN_KEY = "meta:subjects-tutorial-seen";

const INITIAL_FEEDBACK_DELAY_MS = 24 * 60 * 60 * 1000;
const FEEDBACK_SNOOZE_DELAY_MS = 28 * 24 * 60 * 60 * 1000;

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.l.baldacchino.GradePal";

/** ---------- Helpers ---------- */

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function toNum(s?: string) {
  const n = Number((s ?? "").toString().replace(/,/g, "."));
  return Number.isFinite(n) ? n : 0;
}

function safeParseSubjects(raw: string | null): Subject[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((x: any) => {
        const code = String(x?.code ?? "").trim().toUpperCase();
        const name = String(x?.name ?? "").trim();

        const finalMark =
          typeof x?.finalMark === "number" && Number.isFinite(x.finalMark) ? clamp(x.finalMark, 0, 100) : undefined;

        const isExempt = typeof x?.isExempt === "boolean" ? x.isExempt : false;
        const exemptFinalMark =
          typeof x?.exemptFinalMark === "number" && Number.isFinite(x.exemptFinalMark)
            ? clamp(x.exemptFinalMark, 0, 100)
            : undefined;

        const commencement =
          x?.commencement &&
          typeof x.commencement?.year === "number" &&
          typeof x.commencement?.type === "string" &&
          typeof x.commencement?.num === "number"
            ? ({
                year: x.commencement.year,
                type: x.commencement.type as PeriodType,
                num: x.commencement.num,
              } as Commencement)
            : undefined;

        const tagKey = typeof x?.tagKey === "string" ? (x.tagKey as TagKey) : undefined;
        const tagLabel = typeof x?.tagLabel === "string" ? String(x.tagLabel).trim() : undefined;

        const manualOrder = typeof x?.manualOrder === "boolean" ? x.manualOrder : false;

        return {
          code,
          name,
          finalMark,
          isExempt,
          exemptFinalMark,
          commencement,
          tagKey,
          tagLabel,
          manualOrder,
        } as Subject;
      })
      .filter((s: Subject) => s.code.length > 0 && s.name.length > 0);
  } catch {
    return [];
  }
}

function subjectCountsTowardWAM(s: Subject): number | undefined {
  if (typeof s.finalMark === "number" && Number.isFinite(s.finalMark)) return s.finalMark;
  if (s.isExempt && typeof s.exemptFinalMark === "number" && Number.isFinite(s.exemptFinalMark)) return s.exemptFinalMark;
  return undefined;
}

function isCompletedSubject(s: Subject) {
  if (typeof s.finalMark === "number" && Number.isFinite(s.finalMark)) return true;
  if (s.isExempt) return true;
  return false;
}

function calcOverallWAM(subjects: Subject[]): { wam?: number; counted: number } {
  const marks = subjects.map(subjectCountsTowardWAM).filter((m): m is number => typeof m === "number" && Number.isFinite(m));
  if (marks.length === 0) return { wam: undefined, counted: 0 };
  const sum = marks.reduce((acc, m) => acc + m, 0);
  return { wam: sum / marks.length, counted: marks.length };
}

function formatCommencement(c?: Commencement) {
  if (!c) return "";
  return `${c.year} • ${c.type} ${c.num}`;
}

function periodToSortableKey(c?: Commencement) {
  if (!c) return Number.MAX_SAFE_INTEGER;
  const typeWeight = c.type === "Semester" ? 1 : c.type === "Trimester" ? 2 : 3;
  return c.year * 1000 + typeWeight * 10 + c.num;
}

/** ---------- Tag styling ---------- */

function getTagVisual(tagKey?: TagKey) {
  switch (tagKey) {
    case "core":
      return { label: "Core", color: "#2563EB" };
    case "major":
      return { label: "Major", color: "#16A34A" };
    case "minor":
      return { label: "Minor", color: "#ffee00ff" };
    case "elective":
      return { label: "Elective", color: "#9333EA" };
    case "custom":
      return { label: "Custom", color: "#F97316" };
    default:
      return { label: "Subject", color: "#64748B" };
  }
}

function getExemptVisual() {
  return { label: "Exempt", color: "#06B6D4" };
}

/** ---------- Subject row (Swipe-to-delete) ---------- */

type SubjectRowProps = {
  item: Subject;
  drag?: () => void;
  isActive: boolean;
  theme: any;
  styles: ReturnType<typeof makeStyles>;
  onEdit: (s: Subject) => void;
  onRequestDelete: (s: Subject, closeSwipe: () => void) => void;
  canDrag: boolean;
};

const SubjectRow: React.FC<SubjectRowProps> = ({ item, drag, isActive, theme, styles, onEdit, onRequestDelete, canDrag }) => {
  const router = useRouter();
  const wobbleAnim = useRef(new Animated.Value(0)).current;
  const swipeRef = useRef<Swipeable | null>(null);

  useEffect(() => {
    let animation: Animated.CompositeAnimation | undefined;

    if (isActive && canDrag) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(wobbleAnim, { toValue: -2, duration: 70, useNativeDriver: true }),
          Animated.timing(wobbleAnim, { toValue: 2, duration: 70, useNativeDriver: true }),
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
  }, [isActive, wobbleAnim, canDrag]);

  const animatedStyle = {
    transform: [{ translateX: wobbleAnim }, { scale: isActive ? 1.015 : 1 }],
    opacity: isActive ? 0.96 : 1,
  };

  const mark = subjectCountsTowardWAM(item);
  const completed = isCompletedSubject(item);

  const tv = item.isExempt ? getExemptVisual() : getTagVisual(item.tagKey);
  const tagText = item.isExempt ? tv.label : item.tagLabel?.trim() ? item.tagLabel!.trim() : tv.label;

  const accent = tv.color;
  const periodLabel = formatCommencement(item.commencement);

  const closeSwipe = () => swipeRef.current?.close();

  const renderRightActions = () => {
    return (
      <View style={styles.deleteUnderlay}>
        <Text style={styles.deleteUnderlayText}>Delete</Text>
      </View>
    );
  };

  return (
    <View style={{ marginBottom: 10 }}>
      <Swipeable
        ref={swipeRef as any}
        renderRightActions={renderRightActions}
        rightThreshold={72}
        friction={1.6}
        overshootRight={false}
        onSwipeableOpen={(direction) => {
          // Swiping LEFT opens the RIGHT actions => direction === "right"
          if (direction === "right") onRequestDelete(item, closeSwipe);
        }}
      >
        <Animated.View
          style={[
            styles.subjectCard,
            animatedStyle,
            {
              borderColor: theme.border,
              backgroundColor: theme.card,
              borderLeftColor: accent,
              zIndex: isActive ? 50 : 0,
              elevation: isActive ? 12 : 0,
            },
            completed && styles.completedCard,
          ]}
        >
          <View style={{ flex: 1 }}>
            {/* Main tap area goes to planner */}
            <Pressable onPress={() => router.push(`/grade-planner/${encodeURIComponent(item.code)}`)} style={{ paddingRight: 10 }}>
              <View style={styles.subjectTopRow}>
                <Text style={{ flex: 1 }}>
                  <Text style={styles.subjectCode}>{item.code}</Text>
                  <Text style={styles.subjectName}> – {item.name}</Text>
                </Text>

                <View style={[styles.tagPill, { borderColor: accent }]}>
                  <Text style={[styles.tagText, { color: accent }]} numberOfLines={1}>
                    {tagText}
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: 8 }}>
                {item.isExempt ? (
                  <Text style={[styles.metaText, { color: theme.textMuted }]}>
                    Exempt{typeof item.exemptFinalMark === "number" ? ` • Grade: ${item.exemptFinalMark.toFixed(1)}%` : ""}
                  </Text>
                ) : typeof item.finalMark === "number" ? (
                  <Text style={[styles.metaText, { color: theme.textMuted }]}>Final: {item.finalMark.toFixed(1)}%</Text>
                ) : null}

                {typeof mark === "number" ? (
                  <Text style={[styles.metaTiny, { color: theme.textMuted }]}>Counts toward WAM</Text>
                ) : null}
              </View>
            </Pressable>

            {/* Bottom row: NOT inside the main pressable, so icons work */}
            <View style={styles.subjectBottomRow}>
              <Pressable style={{ flex: 1 }} onPress={() => router.push(`/grade-planner/${encodeURIComponent(item.code)}`)}>
                <Text style={[styles.periodText, { color: theme.textMuted }]} numberOfLines={1}>
                  {periodLabel}
                  {completed ? "  •  Completed" : ""}
                </Text>
              </Pressable>

              <View style={styles.actionsRow} pointerEvents="box-none">
                {/* ✅ RectButton so Swipeable doesn't steal the tap */}
                <RectButton
                  style={styles.actionIconBtn}
                  onPress={() => onEdit(item)}
                >
                  <Ionicons name="create-outline" size={18} color={theme.textMuted} />
                </RectButton>

                {canDrag ? (
                  <Pressable
                    onLongPress={(ev: any) => {
                      ev?.stopPropagation?.();
                      drag?.();
                    }}
                    onPressIn={(ev: any) => ev?.stopPropagation?.()}
                    delayLongPress={140}
                    style={styles.actionIconBtn}
                    hitSlop={12}
                  >
                    <Ionicons name="reorder-three-outline" size={22} color={theme.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        </Animated.View>
      </Swipeable>
    </View>
  );
};

/** ---------- Main screen ---------- */

export default function SubjectsScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const [addOpen, setAddOpen] = useState(false);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [periodType, setPeriodType] = useState<PeriodType>("Semester");
  const [periodNum, setPeriodNum] = useState<number>(1);

  const [tagKey, setTagKey] = useState<TagKey>("core");
  const [customTag, setCustomTag] = useState("");

  const [isExempt, setIsExempt] = useState(false);
  const [exemptGrade, setExemptGrade] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);

  const [editName, setEditName] = useState("");
  const [editYear, setEditYear] = useState("");
  const [editPeriodType, setEditPeriodType] = useState<PeriodType>("Semester");
  const [editPeriodNum, setEditPeriodNum] = useState<number>(1);
  const [editTagKey, setEditTagKey] = useState<TagKey>("core");
  const [editCustomTag, setEditCustomTag] = useState("");
  const [editIsExempt, setEditIsExempt] = useState(false);
  const [editExemptGrade, setEditExemptGrade] = useState("");

  const [feedbackChecked, setFeedbackChecked] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  async function persist(next: Subject[]) {
    setSubjects(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  const loadSubjects = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = safeParseSubjects(saved);
      setSubjects(parsed);

      if (!parsed || parsed.length === 0) {
        const seen = await AsyncStorage.getItem(TUTORIAL_SEEN_KEY);
        if (seen !== "true") setShowTutorial(true);
      }
    } catch {}
  }, []);

  const checkFeedbackPrompt = useCallback(async () => {
    try {
      if (Platform.OS !== "android") return;
      if (feedbackChecked) return;

      const now = Date.now();

      const promptedFlag = await AsyncStorage.getItem(FEEDBACK_PROMPTED_KEY);
      if (promptedFlag === "true") {
        setFeedbackChecked(true);
        return;
      }

      let firstOpenRaw = await AsyncStorage.getItem(FIRST_OPEN_KEY);
      if (!firstOpenRaw) {
        await AsyncStorage.setItem(FIRST_OPEN_KEY, String(now));
        setFeedbackChecked(true);
        return;
      }

      const firstOpen = parseInt(firstOpenRaw, 10);
      if (!Number.isFinite(firstOpen)) {
        await AsyncStorage.setItem(FIRST_OPEN_KEY, String(now));
        setFeedbackChecked(true);
        return;
      }

      if (now - firstOpen < INITIAL_FEEDBACK_DELAY_MS) {
        setFeedbackChecked(true);
        return;
      }

      const snoozeRaw = await AsyncStorage.getItem(FEEDBACK_SNOOZE_KEY);
      if (snoozeRaw) {
        const snoozeAt = parseInt(snoozeRaw, 10);
        if (Number.isFinite(snoozeAt) && now - snoozeAt < FEEDBACK_SNOOZE_DELAY_MS) {
          setFeedbackChecked(true);
          return;
        }
      }

      setFeedbackChecked(true);
      setShowFeedback(true);
    } catch {
      setFeedbackChecked(true);
    }
  }, [feedbackChecked]);

  useEffect(() => {
    loadSubjects();
    checkFeedbackPrompt();
  }, [loadSubjects, checkFeedbackPrompt]);

  useFocusEffect(
    useCallback(() => {
      loadSubjects();
      checkFeedbackPrompt();
    }, [loadSubjects, checkFeedbackPrompt])
  );

  const wamInfo = useMemo(() => calcOverallWAM(subjects), [subjects]);
  const wamDisplay = typeof wamInfo.wam === "number" ? wamInfo.wam.toFixed(1) : "--";

  const anyManual = subjects.some((s) => s.manualOrder);

  const { activeList, completedList } = useMemo(() => {
    const active = subjects.filter((s) => !isCompletedSubject(s));
    const completed = subjects.filter((s) => isCompletedSubject(s));

    // If user has manually reordered, preserve their ordering.
    if (anyManual) return { activeList: active, completedList: completed };

    // Active: ascending (earliest -> latest), missing commencement goes to bottom.
    const sortActive = (a: Subject, b: Subject) => {
      const ak = periodToSortableKey(a.commencement);
      const bk = periodToSortableKey(b.commencement);
      if (ak !== bk) return ak - bk;
      return a.code.localeCompare(b.code);
    };

    // Completed: descending (latest -> earliest), missing commencement goes to bottom.
    const sortCompleted = (a: Subject, b: Subject) => {
      const ak = a.commencement ? periodToSortableKey(a.commencement) : -1;
      const bk = b.commencement ? periodToSortableKey(b.commencement) : -1;

      if (ak !== bk) return bk - ak; // ✅ descending
      return a.code.localeCompare(b.code);
    };

    active.sort(sortActive);
    completed.sort(sortCompleted);

    return { activeList: active, completedList: completed };
  }, [subjects, anyManual]);

  function resetAddForm() {
    setCode("");
    setName("");
    setYear(String(new Date().getFullYear()));
    setPeriodType("Semester");
    setPeriodNum(1);
    setTagKey("core");
    setCustomTag("");
    setIsExempt(false);
    setExemptGrade("");
  }

  function getTagLabelFromForm(k: TagKey, custom: string) {
    if (k === "custom") return custom.trim() || "Custom";
    if (k === "core") return "Core";
    if (k === "major") return "Major";
    if (k === "minor") return "Minor";
    return "Elective";
  }

  function maxNumForType(t: PeriodType) {
    if (t === "Semester") return 2;
    if (t === "Trimester") return 3;
    return 4;
  }

  const closeAddModal = useCallback(() => {
    Keyboard.dismiss();
    setAddOpen(false);
    resetAddForm();
  }, []);

  const closeEditModal = useCallback(() => {
    Keyboard.dismiss();
    setEditOpen(false);
    setEditing(null);
  }, []);

  const addSubject = async () => {
    if (!code.trim() || !name.trim()) {
      Alert.alert("Missing info", "Please enter both subject code and name.");
      return;
    }

    const exists = subjects.some((s) => s.code.toUpperCase() === code.trim().toUpperCase());
    if (exists) {
      Alert.alert("Duplicate", "This subject code already exists.");
      return;
    }

    const y = parseInt(year, 10);
    if (!Number.isFinite(y) || y < 2000 || y > 2100) {
      Alert.alert("Invalid year", "Please enter a valid year (e.g. 2027).");
      return;
    }

    const numMax = maxNumForType(periodType);
    const n = clamp(periodNum, 1, numMax);

    const newSub: Subject = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      commencement: { year: y, type: periodType, num: n },
      tagKey,
      tagLabel: getTagLabelFromForm(tagKey, customTag),
      isExempt: isExempt ? true : false,
      exemptFinalMark: isExempt && exemptGrade.trim() !== "" ? clamp(toNum(exemptGrade.trim()), 0, 100) : undefined,
      manualOrder: anyManual,
    };

    const next = [newSub, ...subjects];
    await persist(next).catch(() => {});
    closeAddModal();
  };

  const handleReorderActive = async (activeOrdered: Subject[]) => {
    const nextSubjects = [...activeOrdered, ...completedList].map((s) => ({ ...s, manualOrder: true }));
    await persist(nextSubjects).catch(() => {});
  };

  const finishTutorial = () => {
    setShowTutorial(false);
    AsyncStorage.setItem(TUTORIAL_SEEN_KEY, "true").catch(() => {});
  };

  function openEditModal(sub: Subject) {
    setEditing(sub);
    setEditName(sub.name);

    const c = sub.commencement;
    setEditYear(c?.year ? String(c.year) : String(new Date().getFullYear()));
    setEditPeriodType(c?.type ?? "Semester");
    setEditPeriodNum(c?.num ?? 1);

    setEditTagKey(sub.tagKey ?? "core");
    setEditCustomTag(sub.tagKey === "custom" ? sub.tagLabel ?? "" : "");

    setEditIsExempt(!!sub.isExempt);
    setEditExemptGrade(
      typeof sub.exemptFinalMark === "number" && Number.isFinite(sub.exemptFinalMark)
        ? String(sub.exemptFinalMark.toFixed(1))
        : ""
    );

    setEditOpen(true);
  }

  async function saveEditModal() {
    if (!editing) return;

    const y = parseInt(editYear, 10);
    if (!Number.isFinite(y) || y < 2000 || y > 2100) {
      Alert.alert("Invalid year", "Please enter a valid year (e.g. 2027).");
      return;
    }

    const numMax = maxNumForType(editPeriodType);
    const n = clamp(editPeriodNum, 1, numMax);

    const updatedTagLabel = editTagKey === "custom" ? editCustomTag.trim() || "Custom" : getTagLabelFromForm(editTagKey, "");

    const next = subjects.map((s) => {
      if (s.code !== editing.code) return s;
      return {
        ...s,
        name: editName.trim() ? editName.trim() : s.name,
        commencement: { year: y, type: editPeriodType, num: n },
        tagKey: editTagKey,
        tagLabel: updatedTagLabel,
        isExempt: editIsExempt ? true : false,
        exemptFinalMark: editIsExempt && editExemptGrade.trim() !== "" ? clamp(toNum(editExemptGrade.trim()), 0, 100) : undefined,
      };
    });

    await persist(next).catch(() => {});
    closeEditModal();
  }

  // Swipe-delete with warning confirm
  const requestDeleteSubject = useCallback(
    (sub: Subject, closeSwipe: () => void) => {
      Alert.alert(
        "Delete subject",
        `Are you sure you want to delete the ${sub.code} subject?`,
        [
          { text: "Cancel", style: "cancel", onPress: () => closeSwipe() },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                const next = subjects.filter((s) => s.code !== sub.code);
                await persist(next);

                // also delete its grade planner data
                const plannerKey = `grade-planner:${sub.code.toUpperCase()}`;
                await AsyncStorage.removeItem(plannerKey);
              } catch {
                Alert.alert("Error", "Something went wrong while deleting the subject.");
              } finally {
                closeSwipe();
              }
            },
          },
        ],
        { cancelable: true }
      );
    },
    [subjects]
  );

  const renderActiveItem = ({ item, drag, isActive }: RenderItemParams<Subject>) => {
    return (
      <SubjectRow
        item={item}
        drag={drag}
        isActive={isActive}
        theme={theme}
        styles={s}
        onEdit={openEditModal}
        onRequestDelete={requestDeleteSubject}
        canDrag={true}
      />
    );
  };

  const CompletedSection = useMemo(() => {
    if (completedList.length === 0) return null;

    return (
      <View>
        <View style={[s.completedHeaderWrap, { backgroundColor: theme.bg }]}>
          <Text style={[s.completedHeaderText, { color: theme.textMuted }]}>Completed</Text>
          <View style={[s.completedDivider, { backgroundColor: theme.border }]} />
        </View>

        {completedList.map((sub) => (
          <SubjectRow
            key={`completed:${sub.code}`}
            item={sub}
            isActive={false}
            theme={theme}
            styles={s}
            onEdit={openEditModal}
            onRequestDelete={requestDeleteSubject}
            canDrag={false}
          />
        ))}
      </View>
    );
  }, [completedList, theme, s, requestDeleteSubject]);

  const ListHeader = useMemo(() => {
    return (
      <View>
        <Text style={s.title}>Subjects</Text>
        <Text style={s.subtitle}>Tap a subject to open its grade planner. Long-press ≡ to reorder active subjects.</Text>

        <View style={s.divider} />

        <View style={[s.wamCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.wamLabel, { color: theme.textMuted }]}>Overall WAM</Text>
          <Text style={[s.wamValue, { color: theme.text }]}>{wamDisplay}</Text>
          <Text style={[s.wamHelper, { color: theme.textMuted }]}>
            {wamInfo.counted > 0
              ? `Based on ${wamInfo.counted} counted subject${wamInfo.counted === 1 ? "" : "s"}`
              : "No counted subjects yet"}
          </Text>
        </View>

        <Pressable onPress={() => setAddOpen(true)} style={[s.addBtn, { backgroundColor: theme.primary }]}>
          <Ionicons name="add" size={18} color={theme.primaryText} />
          <Text style={[s.addBtnText, { color: theme.primaryText }]}>Add subject</Text>
        </Pressable>

        <Text style={[s.swipeHint, { color: theme.textMuted }]}>Tip: Swipe left to delete subject</Text>
      </View>
    );
  }, [s, theme, wamDisplay, wamInfo.counted]);

  return (
    <View style={[s.screen]}>
      <DraggableFlatList<Subject>
        key="active-list"
        style={{ flex: 1 }}
        containerStyle={{ flex: 1 }}
        data={activeList}
        extraData={subjects}
        keyExtractor={(item) => `active:${item.code}`}
        renderItem={renderActiveItem}
        onDragBegin={() => setIsDragging(true)}
        onDragEnd={({ data }) => {
          setIsDragging(false);
          handleReorderActive(data);
        }}
        activationDistance={10}
        autoscrollSpeed={40}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={() => Keyboard.dismiss()}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={CompletedSection}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 110,
          flexGrow: 1,
        }}
      />

      {/* ADD MODAL */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={closeAddModal}>
        <View style={s.modalOverlay}>
          {/* Tap outside the card closes modal */}
          <Pressable style={StyleSheet.absoluteFill} onPress={closeAddModal} />

          {/* ✅ Keyboard-safe modal: scroll + keyboard avoiding */}
          <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "padding"}
              style={{ width: "100%", maxWidth: 520, flex: 1 }}
            >
            <View style={[s.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[s.modalTitle, { color: theme.text }]}>Add subject</Text>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }}
              >
                {/* Tap blank space inside content dismisses keyboard */}
                <Pressable style={{ height: 6 }} onPress={() => Keyboard.dismiss()} />

                <Text style={[s.smallLabel, { color: theme.textMuted, marginTop: 10 }]}>Subject code</Text>
                <TextInput
                  value={code}
                  onChangeText={(t) => setCode(t.toUpperCase())}
                  placeholder="e.g. CSE3MAD"
                  placeholderTextColor={theme.textMuted}
                  style={s.inputCompact}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="next"
                />

                <Text style={[s.smallLabel, { color: theme.textMuted, marginTop: 10 }]}>Subject name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Mobile App Development"
                  placeholderTextColor={theme.textMuted}
                  style={s.inputCompact}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                />

                <Text style={[s.smallLabel, { color: theme.textMuted, marginTop: 12 }]}>Commencement period</Text>

                <View style={s.inlineRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.microLabel, { color: theme.textMuted }]}>Year</Text>
                    <TextInput
                      value={year}
                      onChangeText={(t) => setYear(t.replace(/[^0-9]/g, ""))}
                      placeholder="2027"
                      placeholderTextColor={theme.textMuted}
                      keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
                      inputMode="numeric"
                      style={s.inputCompact}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[s.microLabel, { color: theme.textMuted }]}>Number</Text>
                    <View style={s.numRow}>
                      {Array.from({ length: maxNumForType(periodType) }, (_, i) => i + 1).map((n) => {
                        const active = periodNum === n;
                        return (
                          <Pressable
                            key={n}
                            onPress={() => setPeriodNum(n)}
                            style={[
                              s.numChip,
                              { borderColor: active ? theme.primary : theme.border, backgroundColor: theme.card },
                            ]}
                          >
                            <Text style={[s.numChipText, { color: active ? theme.primary : theme.textMuted }]}>{n}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>

                <View style={{ marginTop: 10 }}>
                  <Text style={[s.microLabel, { color: theme.textMuted }]}>Type</Text>
                  <View style={s.chipsRow}>
                    {(["Semester", "Trimester", "Term"] as PeriodType[]).map((pt) => {
                      const active = periodType === pt;
                      return (
                        <Pressable
                          key={pt}
                          onPress={() => {
                            setPeriodType(pt);
                            const mx = maxNumForType(pt);
                            setPeriodNum((prev) => Math.min(prev, mx));
                          }}
                          style={[s.chip, { borderColor: active ? theme.primary : theme.border, backgroundColor: theme.card }]}
                        >
                          <Text style={[s.chipText, { color: active ? theme.primary : theme.textMuted }]}>{pt}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={[s.helperText, { color: theme.textMuted }]}>Example: 2027 • Semester 1</Text>
                </View>

                <Text style={[s.smallLabel, { color: theme.textMuted, marginTop: 12 }]}>Tag</Text>
                <View style={s.chipsRow}>
                  {([
                    { key: "core", label: "Core" },
                    { key: "major", label: "Major" },
                    { key: "minor", label: "Minor" },
                    { key: "elective", label: "Elective" },
                    { key: "custom", label: "Custom" },
                  ] as { key: TagKey; label: string }[]).map((x) => {
                    const active = tagKey === x.key;
                    const tv = getTagVisual(x.key);
                    return (
                      <Pressable
                        key={x.key}
                        onPress={() => setTagKey(x.key)}
                        style={[s.chip, { borderColor: active ? tv.color : theme.border, backgroundColor: theme.card }]}
                      >
                        <Text style={[s.chipText, { color: active ? tv.color : theme.textMuted }]}>{x.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {tagKey === "custom" && (
                  <TextInput
                    value={customTag}
                    onChangeText={setCustomTag}
                    placeholder="Enter custom tag (e.g. Minor)"
                    placeholderTextColor={theme.textMuted}
                    style={[s.inputCompact, { marginTop: 10 }]}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                )}

                <View style={{ marginTop: 14 }}>
                  <Pressable
                    onPress={() => {
                      setIsExempt((p) => !p);
                      if (isExempt) setExemptGrade("");
                    }}
                    style={[
                      s.togglePill,
                      { borderColor: isExempt ? theme.primary : theme.border, backgroundColor: theme.card },
                    ]}
                  >
                    <Text style={[s.toggleText, { color: isExempt ? theme.primary : theme.textMuted }]}>
                      {isExempt ? "Exempt subject ✓" : "Exempt subject"}
                    </Text>
                  </Pressable>

                  {isExempt && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={[s.microLabel, { color: theme.textMuted }]}>Exempt grade (optional)</Text>
                      <TextInput
                        value={exemptGrade}
                        onChangeText={(t) => setExemptGrade(t.replace(/[^0-9.]/g, ""))}
                        placeholder="e.g. 75"
                        placeholderTextColor={theme.textMuted}
                        keyboardType={Platform.OS === "ios" ? "decimal-pad" : "number-pad"}
                        inputMode="decimal"
                        style={s.inputCompact}
                      />
                      <Text style={[s.helperText, { color: theme.textMuted }]}>
                        Leave blank if no grade was awarded (it won’t count toward WAM).
                      </Text>
                    </View>
                  )}
                </View>

                {/* bottom blank space to tap */}
                <Pressable style={{ height: 18 }} onPress={() => Keyboard.dismiss()} />
              </ScrollView>

              <View style={s.modalButtonsRow}>
                <Pressable onPress={closeAddModal} style={[s.modalBtn, { backgroundColor: theme.border }]}>
                  <Text style={[s.modalBtnText, { color: theme.text }]}>Cancel</Text>
                </Pressable>

                <Pressable onPress={addSubject} style={[s.modalBtn, { backgroundColor: theme.primary }]}>
                  <Text style={[s.modalBtnText, { color: theme.primaryText }]}>Add</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* EDIT MODAL */}
      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={closeEditModal}>
        <View style={s.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeEditModal} />

          <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "padding"}
              style={{ width: "100%", maxWidth: 520, flex: 1 }}
            >
            <View style={[s.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[s.modalTitle, { color: theme.text }]}>
                Edit {editing?.code ?? ""}
              </Text>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }}
              >
                <Pressable style={{ height: 6 }} onPress={() => Keyboard.dismiss()} />

                <Text style={[s.smallLabel, { color: theme.textMuted, marginTop: 10 }]}>Subject name</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="e.g. Mobile App Development"
                  placeholderTextColor={theme.textMuted}
                  style={s.inputCompact}
                  autoCapitalize="words"
                  autoCorrect={false}
                />

                <Text style={[s.smallLabel, { color: theme.textMuted, marginTop: 12 }]}>Commencement period</Text>

                <View style={s.inlineRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.microLabel, { color: theme.textMuted }]}>Year</Text>
                    <TextInput
                      value={editYear}
                      onChangeText={(t) => setEditYear(t.replace(/[^0-9]/g, ""))}
                      placeholder="2027"
                      placeholderTextColor={theme.textMuted}
                      keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
                      inputMode="numeric"
                      style={s.inputCompact}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[s.microLabel, { color: theme.textMuted }]}>Number</Text>
                    <View style={s.numRow}>
                      {Array.from({ length: maxNumForType(editPeriodType) }, (_, i) => i + 1).map((n) => {
                        const active = editPeriodNum === n;
                        return (
                          <Pressable
                            key={n}
                            onPress={() => setEditPeriodNum(n)}
                            style={[
                              s.numChip,
                              { borderColor: active ? theme.primary : theme.border, backgroundColor: theme.card },
                            ]}
                          >
                            <Text style={[s.numChipText, { color: active ? theme.primary : theme.textMuted }]}>{n}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>

                <View style={{ marginTop: 10 }}>
                  <Text style={[s.microLabel, { color: theme.textMuted }]}>Type</Text>
                  <View style={s.chipsRow}>
                    {(["Semester", "Trimester", "Term"] as PeriodType[]).map((pt) => {
                      const active = editPeriodType === pt;
                      return (
                        <Pressable
                          key={pt}
                          onPress={() => {
                            setEditPeriodType(pt);
                            const mx = maxNumForType(pt);
                            setEditPeriodNum((prev) => Math.min(prev, mx));
                          }}
                          style={[s.chip, { borderColor: active ? theme.primary : theme.border, backgroundColor: theme.card }]}
                        >
                          <Text style={[s.chipText, { color: active ? theme.primary : theme.textMuted }]}>{pt}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <Text style={[s.smallLabel, { color: theme.textMuted, marginTop: 12 }]}>Tag</Text>
                <View style={s.chipsRow}>
                  {([
                    { key: "core", label: "Core" },
                    { key: "major", label: "Major" },
                    { key: "minor", label: "Minor" },
                    { key: "elective", label: "Elective" },
                    { key: "custom", label: "Custom" },
                  ] as { key: TagKey; label: string }[]).map((x) => {
                    const active = editTagKey === x.key;
                    const tv = getTagVisual(x.key);
                    return (
                      <Pressable
                        key={x.key}
                        onPress={() => setEditTagKey(x.key)}
                        style={[s.chip, { borderColor: active ? tv.color : theme.border, backgroundColor: theme.card }]}
                      >
                        <Text style={[s.chipText, { color: active ? tv.color : theme.textMuted }]}>{x.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {editTagKey === "custom" && (
                  <TextInput
                    value={editCustomTag}
                    onChangeText={setEditCustomTag}
                    placeholder="Enter custom tag"
                    placeholderTextColor={theme.textMuted}
                    style={[s.inputCompact, { marginTop: 10 }]}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                )}

                <View style={{ marginTop: 14 }}>
                  <Pressable
                    onPress={() => {
                      setEditIsExempt((p) => !p);
                      if (editIsExempt) setEditExemptGrade("");
                    }}
                    style={[s.togglePill, { borderColor: editIsExempt ? theme.primary : theme.border, backgroundColor: theme.card }]}
                  >
                    <Text style={[s.toggleText, { color: editIsExempt ? theme.primary : theme.textMuted }]}>
                      {editIsExempt ? "Exempt subject ✓" : "Exempt subject"}
                    </Text>
                  </Pressable>

                  {editIsExempt && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={[s.microLabel, { color: theme.textMuted }]}>Exempt grade (optional)</Text>
                      <TextInput
                        value={editExemptGrade}
                        onChangeText={(t) => setEditExemptGrade(t.replace(/[^0-9.]/g, ""))}
                        placeholder="e.g. 75"
                        placeholderTextColor={theme.textMuted}
                        keyboardType={Platform.OS === "ios" ? "decimal-pad" : "number-pad"}
                        inputMode="decimal"
                        style={s.inputCompact}
                      />
                    </View>
                  )}
                </View>

                <Pressable style={{ height: 18 }} onPress={() => Keyboard.dismiss()} />
              </ScrollView>

              <View style={s.modalButtonsRow}>
                <Pressable onPress={closeEditModal} style={[s.modalBtn, { backgroundColor: theme.border }]}>
                  <Text style={[s.modalBtnText, { color: theme.text }]}>Cancel</Text>
                </Pressable>

                <Pressable onPress={saveEditModal} style={[s.modalBtn, { backgroundColor: theme.primary }]}>
                  <Text style={[s.modalBtnText, { color: theme.primaryText }]}>Save</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Tutorial overlay */}
      {showTutorial && (
        <View style={s.tutorialOverlay}>
          <View style={[s.tutorialCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.tutorialTitle, { color: theme.text }]}>Welcome to Grade Pal 👋</Text>
            <Text style={[s.tutorialBody, { color: theme.textMuted }]}>
              Start by adding your first subject:
              {"\n\n"}1. Tap “Add subject”
              {"\n"}2. Enter subject code + name
              {"\n"}3. Select the commencement period + tag
              {"\n"}4. Tap Add
              {"\n\n"}Then tap the subject to open the grade planner. ❤️
            </Text>

            <Pressable style={[s.tutorialPrimaryBtn, { backgroundColor: theme.primary }]} onPress={finishTutorial}>
              <Text style={[s.tutorialPrimaryText, { color: theme.primaryText }]}>Got it</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Feedback prompt overlay */}
      {showFeedback && !showTutorial && (
        <View style={s.feedbackOverlay}>
          <View style={[s.feedbackCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.feedbackTitle, { color: theme.text }]}>Enjoying Grade Pal?</Text>

            <View style={s.starsRow}>
              <Text style={s.star}>⭐</Text>
              <Text style={s.star}>⭐</Text>
              <Text style={s.star}>⭐</Text>
              <Text style={s.star}>⭐</Text>
              <Text style={s.star}>⭐</Text>
            </View>

            <Text style={[s.feedbackSubtitle, { color: theme.textMuted }]}>
              If Grade Pal has helped you understand your grades, please consider leaving a quick review 💛
            </Text>

            <Pressable
              style={[s.reviewButton, { backgroundColor: theme.primary }]}
              onPress={() => {
                AsyncStorage.setItem(FEEDBACK_PROMPTED_KEY, "true").catch(() => {});
                setShowFeedback(false);
                Linking.openURL(PLAY_STORE_URL).catch(() => {
                  Alert.alert("Unable to open Play Store", "Please search for 'Grade Pal' on the Play Store to leave a review.");
                });
              }}
            >
              <Text style={[s.reviewButtonText, { color: theme.primaryText }]}>Leave a Review</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                AsyncStorage.setItem(FEEDBACK_SNOOZE_KEY, String(Date.now())).catch(() => {});
                setShowFeedback(false);
              }}
              style={s.maybeLaterWrapper}
            >
              <Text style={[s.maybeLaterText, { color: theme.textMuted }]}>Maybe later</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

/** ---------- Styles ---------- */

const makeStyles = (t: any) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },

    title: { color: t.text, fontSize: 22, fontWeight: "700", marginBottom: 4 },
    subtitle: { color: t.textMuted, fontSize: 13, marginBottom: 12 },
    divider: { height: 1, backgroundColor: t.border, marginBottom: 12 },

    wamCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 12 },
    wamLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
    wamValue: { fontSize: 34, fontWeight: "900", letterSpacing: 0.3 },
    wamHelper: { marginTop: 6, fontSize: 12, lineHeight: 16 },

    addBtn: {
      height: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      marginBottom: 8,
    },
    addBtnText: { fontSize: 14, fontWeight: "800" },

    swipeHint: { fontSize: 12, fontWeight: "700", marginBottom: 10 },

    deleteUnderlay: {
      flex: 1,
      backgroundColor: "#E25563",
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "flex-end",
      paddingRight: 18,
    },
    deleteUnderlayText: { color: "#fff", fontSize: 14, fontWeight: "900", letterSpacing: 0.2 },

    subjectCard: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "flex-start", borderLeftWidth: 6 },
    completedCard: { opacity: 0.88 },

    subjectTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    subjectCode: { color: t.text, fontWeight: "800", fontSize: 15 },
    subjectName: { color: t.textMuted, fontSize: 15, fontWeight: "400" },
    metaText: { fontSize: 12, fontWeight: "600" },
    metaTiny: { fontSize: 11, fontWeight: "600", opacity: 0.85, marginTop: 2 },

    tagPill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, maxWidth: 120 },
    tagText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.2 },

    subjectBottomRow: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    periodText: { flex: 1, fontSize: 12, fontWeight: "800" },

    actionsRow: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 10 },
    actionIconBtn: {
      width: 34,
      height: 34,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.bg,
    },

    completedHeaderWrap: { marginTop: 10, marginBottom: 10, paddingTop: 6, paddingBottom: 6 },
    completedHeaderText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 8 },
    completedDivider: { height: 1, opacity: 0.8 },

    modalOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center",
      padding: 22,
      justifyContent: Platform.OS === "android" ? "flex-end" : "center",
      paddingBottom: Platform.OS === "android" ? 20 : 22,
      paddingTop: Platform.OS === "android" ? 20 : 22,
    },
    modalCard: {
      width: "100%",
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      maxWidth: 520,
      maxHeight: "90%",
      flexShrink: 0,
    },
    modalTitle: { fontSize: 18, fontWeight: "900" },

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
    },

    smallLabel: { fontSize: 12, fontWeight: "800", marginBottom: 6 },
    microLabel: { fontSize: 11, fontWeight: "800", marginBottom: 6 },

    inlineRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 6 },

    chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    chipText: { fontSize: 12, fontWeight: "900" },

    numRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    numChip: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, minWidth: 44, alignItems: "center", justifyContent: "center" },
    numChipText: { fontSize: 12, fontWeight: "900" },

    togglePill: { borderWidth: 1, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 12, alignSelf: "flex-start" },
    toggleText: { fontSize: 12, fontWeight: "900" },
    helperText: { marginTop: 6, fontSize: 12, lineHeight: 16 },

    modalButtonsRow: { flexDirection: "row", gap: 10, marginTop: 16 },
    modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    modalBtnText: { fontSize: 14, fontWeight: "900" },

    tutorialOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    tutorialCard: { width: "100%", borderRadius: 20, paddingVertical: 20, paddingHorizontal: 18, borderWidth: 1, alignItems: "center", maxWidth: 520 },
    tutorialTitle: { fontSize: 18, fontWeight: "800", marginBottom: 8, textAlign: "center" },
    tutorialBody: { fontSize: 14, textAlign: "left", lineHeight: 20, marginBottom: 16 },
    tutorialPrimaryBtn: { width: "100%", paddingVertical: 12, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    tutorialPrimaryText: { fontSize: 15, fontWeight: "900" },

    feedbackOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.65)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    feedbackCard: { width: "100%", borderRadius: 22, padding: 18, alignItems: "center", borderWidth: 1, maxWidth: 520 },
    feedbackTitle: { fontSize: 20, fontWeight: "900", marginBottom: 6 },
    starsRow: { flexDirection: "row", gap: 4, marginVertical: 6 },
    star: { fontSize: 26, color: "#FFD43B" },
    feedbackSubtitle: { fontSize: 13, textAlign: "center", marginBottom: 16, lineHeight: 18 },
    reviewButton: { width: "100%", paddingVertical: 14, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    reviewButtonText: { fontSize: 16, fontWeight: "900" },
    maybeLaterWrapper: { marginTop: 10, paddingVertical: 6 },
    maybeLaterText: { fontSize: 13, fontWeight: "700" },
  });
