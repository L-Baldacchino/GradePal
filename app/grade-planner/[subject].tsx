// app/grade-planner/[subject].tsx

// Persistent storage for assessment lists
import AsyncStorage from "@react-native-async-storage/async-storage";
// Hook to pull the subject code from the URL
import { useLocalSearchParams, useNavigation } from "expo-router";
// Core React hooks
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
// UI + RN utilities
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
// Draggable list for reordering assessments
import DraggableFlatList, {
  RenderItemParams,
} from "react-native-draggable-flatlist";
// Safe area helpers
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
// Theme (colors, fonts, etc.)
// NOTE: we import the hook type here for typing makeStyles correctly.
import { useTheme } from "../../theme/ThemeProvider";

// -------------------------------
// Types and helpers
// -------------------------------

// Each assessment item stored per subject
export type Assessment = {
  id: string;
  name: string;
  weight: string;
  grade?: string;
  type?: "Assignment" | "Exam" | "Quiz" | "Other";
  hurdle?: boolean; // true = must get at least 50% on this item to pass subject
};

// Default template used only for *new* subjects on the first load
const seed: Assessment[] = [
  {
    id: "a1",
    name: "Assignment 1",
    weight: "20",
    grade: "",
    type: "Assignment",
  },
  {
    id: "a2",
    name: "Assignment 2",
    weight: "30",
    grade: "",
    type: "Assignment",
  },
  {
    id: "exam",
    name: "Exam",
    weight: "50",
    grade: "",
    type: "Exam",
  },
];

// Subjects list key (home screen subjects)
const SUBJECTS_LIST_KEY = "subjects-list:v1";

// Convert string → number safely
function toNum(s?: string) {
  const n = Number((s ?? "").toString().replace(/,/g, "."));
  return isNaN(n) ? 0 : n;
}

// Clamp number to a safe range
function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

// -------------------------------
// Main component
// -------------------------------
export default function SubjectPlannerScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  // Get subject code from URL (e.g. /grade-planner/CSE3MAD)
  const { subject } = useLocalSearchParams<{ subject: string }>();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();

  // Standardise the subject code
  const code = decodeURIComponent(subject ?? "").toUpperCase();
  const STORAGE_KEY = `grade-planner:${code}`;

  // Planner contents
  const [items, setItems] = useState<Assessment[]>(seed);
  // User-configurable pass mark (default 50%)
  const [targetPass, setTargetPass] = useState<number>(50);

  // Controls “Add Assessment” modal visibility
  const [showAdd, setShowAdd] = useState(false);

  // Bottom padding tracking
  const [footerH, setFooterH] = useState(72);

  // Configure the header when the page loads
  useLayoutEffect(() => {
    nav.setOptions({
      title: `Grade Planner • ${code}`,
      headerStyle: { backgroundColor: theme.navBg },
      headerTintColor: theme.navText,
      headerTitleStyle: { color: theme.navText },
    });
  }, [nav, code, theme]);

  // -------------------------------
  // Load saved planner (runs once)
  // -------------------------------
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.items)) {
            setItems(parsed.items);
          }
          if (typeof parsed.targetPass === "number") {
            setTargetPass(parsed.targetPass);
          }
        }
      } catch {
        // ignore
      }
    })();
  }, [STORAGE_KEY]);

  // Persist every time the items array OR targetPass changes
  useEffect(() => {
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ items, targetPass })
    ).catch(() => {});
  }, [items, targetPass, STORAGE_KEY]);

  // -------------------------------
  // Stats for the banner + pass helper
  // -------------------------------
  const {
    sumContribution,
    totalWeight,
    completedWeight,
    remainingWeight,
    finalMin,
    finalMax,
    requiredOnRemaining,
    hurdles,
    anyHurdles,
    anyHurdleFailed,
    anyHurdleMissing,
  } = useMemo(() => {
    // Total weight of *all* items
    let totalWeight = 0;
    // Weight of items that already have a grade entered
    let completedWeight = 0;
    // Sum of weighted contributions from graded items
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

    const sumContribution = contributions; // current accumulated %
    const remainingWeightRaw = 100 - completedWeight;
    const remainingWeight = clamp(remainingWeightRaw, 0, 100);

    const accumulated = clamp(sumContribution, 0, 100);
    const finalMin = accumulated; // if you get 0% on everything left
    const finalMax = clamp(accumulated + remainingWeight, 0, 100); // if you ace everything left

    // Hurdle logic
    const hurdles = items.filter((i) => i.hurdle);
    const anyHurdles = hurdles.length > 0;
    const anyHurdleFailed = hurdles.some((i) => {
      if (i.grade === undefined || i.grade === "") return false;
      const g = clamp(toNum(i.grade));
      return g < 50; // must be at least 50% on each hurdle
    });
    const anyHurdleMissing = hurdles.some(
      (i) => i.grade === undefined || i.grade === ""
    );

    // How much do we need on the remaining weighting to hit targetPass?
    let requiredOnRemaining: number | null = null;
    if (remainingWeight > 0) {
      requiredOnRemaining =
        ((targetPass - sumContribution) / remainingWeight) * 100;
    }

    return {
      sumContribution,
      totalWeight,
      completedWeight,
      remainingWeight,
      finalMin,
      finalMax,
      requiredOnRemaining,
      hurdles,
      anyHurdles,
      anyHurdleFailed,
      anyHurdleMissing,
    };
  }, [items, targetPass]);

  const isPerfect = Math.abs(totalWeight - 100) < 0.01;
  const hasRemaining = remainingWeight > 0.01;

  const alreadyPassed =
    !anyHurdleFailed &&
    !anyHurdleMissing &&
    finalMin >= targetPass;

  const impossibleToPassByMarks = finalMax < targetPass && hasRemaining;
  const impossibleToPass =
    impossibleToPassByMarks || anyHurdleFailed;

  const requiredDisplay =
    requiredOnRemaining != null
      ? Math.max(0, Math.min(100, requiredOnRemaining))
      : null;

  // -------------------------------
  // Mutations for assessments
  // -------------------------------
  function updateItem(id: string, patch: Partial<Assessment>) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
    );
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function addItem(newItem: Assessment) {
    setItems((prev) => [...prev, newItem]);
  }

  // Reorder handler for DraggableFlatList
  function handleReorder(data: Assessment[]) {
    setItems(data);
  }

  // -------------------------------
  // Remove subject (from home list + this planner)
  // -------------------------------
  async function confirmRemoveSubject() {
    Alert.alert(
      "Remove subject",
      `Remove ${code} from your subjects list and delete its grade planner?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              // Remove from subjects list
              const saved = await AsyncStorage.getItem(SUBJECTS_LIST_KEY);
              if (saved) {
                const list = JSON.parse(saved) as {
                  code: string;
                  name: string;
                }[];
                const updated = list.filter(
                  (s) => s.code.toUpperCase() !== code
                );
                await AsyncStorage.setItem(
                  SUBJECTS_LIST_KEY,
                  JSON.stringify(updated)
                );
              }

              // Remove this subject's planner data
              await AsyncStorage.removeItem(STORAGE_KEY);

              // Go back to previous screen (Home tab)
              // @ts-ignore - nav type from expo-router
              nav.goBack();
            } catch {
              Alert.alert(
                "Error",
                "Something went wrong while removing the subject."
              );
            }
          },
        },
      ]
    );
  }

  // Space at bottom so list content never hides behind modal/footer
  const listBottomPad = insets.bottom + footerH + 24;

  // -------------------------------
  // Footer (Add button row, then weighting + remove subject row)
  // -------------------------------
  const Footer = (
    <View
      style={[s.footer, { paddingBottom: insets.bottom + 8 }]}
      onLayout={(e: LayoutChangeEvent) =>
        setFooterH(e.nativeEvent.layout.height)
      }
    >
      {/* Top row: Add item full width */}
      <View style={s.bottomRowEven}>
        <View style={s.bottomItem}>
          <Pressable
            onPress={() => setShowAdd(true)}
            style={[
              s.primaryBtn,
              s.fullWidthBtn,
              { backgroundColor: theme.primary },
            ]}
          >
            <Text style={[s.primaryBtnText, { color: theme.primaryText }]}>
              Add item
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Bottom row: Total weighting (left) + Remove subject (right) */}
      <View style={[s.bottomRowEven, { marginTop: 12 }]}>
        {/* Total weighting indicator on the left */}
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
            <Text
              style={[
                s.weightPillText,
                { color: isPerfect ? theme.success : theme.danger },
              ]}
            >
              {isPerfect
                ? `Total weighting = 100%`
                : `Total weighting = ${totalWeight.toFixed(1)}%`}
            </Text>
          </View>
        </View>

        {/* Remove subject on the right */}
        <View style={[s.bottomItem, { alignItems: "flex-end" }]}>
          <Pressable
            onPress={confirmRemoveSubject}
            style={s.removeSubjectBtn}
          >
            <Text style={s.removeSubjectText}>Remove subject</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  // -------------------------------
  // Draggable row renderer
  // -------------------------------
  const renderItem = ({ item, drag, isActive }: RenderItemParams<Assessment>) => (
    <AssessmentRow
      item={item}
      drag={drag}
      isActive={isActive}
      theme={theme}
      s={s}
      updateItem={updateItem}
      removeItem={removeItem}
    />
  );

  // -------------------------------
  // Main layout
  // -------------------------------
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
            {/* Snapshot banner */}
            <View style={s.banner}>
              <Text style={s.bannerLabel}>Subject snapshot</Text>
              {/* Accumulated big number */}
              <Text style={s.bannerValue}>{sumContribution.toFixed(1)}%</Text>
              <Text style={s.bannerCaption}>Accumulated so far</Text>

              {/* Divider line */}
              <View style={s.bannerDivider} />

              {/* Remaining weight */}
              <View style={s.bannerRow}>
                <Text style={s.bannerStatLabel}>Remaining weight</Text>
                <Text style={s.bannerStatValue}>
                  {remainingWeight.toFixed(1)}%
                </Text>
              </View>

              {/* Possible final range */}
              <View style={s.bannerRow}>
                <Text style={s.bannerStatLabel}>Possible final range</Text>
                <Text style={s.bannerStatValue}>
                  {`${Math.round(finalMin)}% – ${Math.round(finalMax)}%`}
                </Text>
              </View>

              {/* Editable pass mark */}
              <View style={s.bannerRow}>
                <Text style={s.bannerStatLabel}>Pass mark</Text>
                <TextInput
                  value={String(Math.round(targetPass))}
                  onChangeText={(t) => {
                    const cleaned = t.replace(/[^0-9.]/g, "");
                    const num = clamp(toNum(cleaned), 0, 100);
                    setTargetPass(num);
                  }}
                  keyboardType={
                    Platform.OS === "ios" ? "decimal-pad" : "number-pad"
                  }
                  inputMode="decimal"
                  style={s.bannerPassInput}
                  placeholder="50"
                  placeholderTextColor={theme.textMuted}
                />
              </View>
            </View>

            {/* What do I need to pass? */}
            <View style={s.passCard}>
              <Text style={s.passTitle}>What do I need to pass?</Text>
              <Text style={s.passSubtitle}>
                Pass mark set to {Math.round(targetPass)}% overall.
              </Text>

              {/* Hurdle-first logic */}
              {anyHurdleFailed ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={s.passText}>
                    ⚠️ One or more hurdle tasks are currently below 50%.
                  </Text>
                  <Text style={s.passText}>
                    Even if your overall mark reaches {Math.round(targetPass)}%,
                    failing a hurdle usually means you cannot pass the subject.
                  </Text>
                </View>
              ) : impossibleToPassByMarks ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={s.passText}>
                    Even with 100% in the remaining{" "}
                    {remainingWeight.toFixed(1)}%, your final mark would only
                    reach about {finalMax.toFixed(1)}%.
                  </Text>
                  <Text style={s.passText}>
                    That’s below the {Math.round(targetPass)}% pass mark.
                  </Text>
                </View>
              ) : !hasRemaining ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={s.passText}>
                    There’s no remaining weighting left in this subject.
                  </Text>
                  <Text style={s.passText}>
                    Your final mark is approximately{" "}
                    {finalMin.toFixed(1)}%.
                  </Text>
                  {anyHurdles && !anyHurdleMissing && (
                    <Text style={s.passText}>
                      All hurdle tasks currently meet the 50% requirement.
                    </Text>
                  )}
                  {anyHurdles && anyHurdleMissing && (
                    <Text style={s.passText}>
                      Some hurdle tasks don’t have results recorded yet.
                    </Text>
                  )}
                </View>
              ) : alreadyPassed ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={s.passText}>
                    🎉 Based on your current results, you’ve already reached the{" "}
                    {Math.round(targetPass)}% pass mark.
                  </Text>
                  {anyHurdles && (
                    <Text style={s.passText}>
                      You also meet the 50% hurdle requirement on all marked
                      tasks.
                    </Text>
                  )}
                </View>
              ) : (
                <View style={{ marginTop: 8 }}>
                  <Text style={s.passText}>
                    To reach {Math.round(targetPass)}% overall, you need an
                    average of{" "}
                    <Text style={s.passHighlight}>
                      {requiredDisplay?.toFixed(1)}%
                    </Text>{" "}
                    across your remaining{" "}
                    {remainingWeight.toFixed(1)}% weighting.
                  </Text>
                </View>
              )}

              {/* Extra hurdle info if they exist but not failed */}
              {anyHurdles && !anyHurdleFailed && (
                <View style={{ marginTop: 8 }}>
                  <Text style={s.passText}>
                    Hurdle tasks (minimum 50% each):
                  </Text>
                  <Text style={s.passText}>
                    {hurdles
                      .map((h) => h.name?.trim() || "Unnamed task")
                      .join(", ")}
                  </Text>
                  {anyHurdleMissing && (
                    <Text style={s.passText}>
                      {"\n"}Some hurdle results are still missing, make sure each one
                      is at least 50%.
                    </Text>
                  )}
                </View>
              )}
            </View>
          </View>
        }
        ListFooterComponent={Footer}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />

      {/* --------------------------------------------------
          Add item modal (keyboard-aware)
          -------------------------------------------------- */}
      <Modal
        visible={showAdd}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAdd(false)}
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }}
          edges={["top"]}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              <View style={s.modalCard}>
                <Text style={s.modalTitle}>Add assessment</Text>

                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: 8 }}
                >
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
};

function AssessmentRow({
  item,
  drag,
  isActive,
  theme,
  s,
  updateItem,
  removeItem,
}: RowProps) {
  const wobbleAnim = useRef(new Animated.Value(0)).current;

  // Wobble effect while dragging
  useEffect(() => {
    let animation: Animated.CompositeAnimation | undefined;

    if (isActive) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(wobbleAnim, {
            toValue: -3,
            duration: 80,
            useNativeDriver: true,
          }),
          Animated.timing(wobbleAnim, {
            toValue: 3,
            duration: 80,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    } else {
      if (animation) {
        animation.stop();
      }
      wobbleAnim.stopAnimation();
      wobbleAnim.setValue(0);
    }

    return () => {
      if (animation) {
        animation.stop();
      }
      wobbleAnim.stopAnimation();
      wobbleAnim.setValue(0);
    };
  }, [isActive, wobbleAnim]);

  const animatedStyle = {
    transform: [
      { translateX: wobbleAnim },
      { scale: isActive ? 1.02 : 1 },
    ],
    opacity: isActive ? 0.97 : 1,
  };

  // Metadata text (e.g., "Assignment • Hurdle")
  const metaParts: string[] = [];
  //if (item.type) metaParts.push(item.type);
  //if (item.hurdle) metaParts.push("Hurdle");

  return (
    <Animated.View style={[s.card, animatedStyle]}>
      {/* Header row: name + drag handle */}
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
        <Pressable
          onLongPress={drag}
          delayLongPress={150}
          style={s.dragHandle}
          hitSlop={10}
        >
          <Text style={{ color: theme.textMuted, fontSize: 18 }}>≡</Text>
        </Pressable>
      </View>

      {/* Type selector: Assignment / Exam / Quiz */}
      <View style={[s.row, { marginBottom: 8 }]}>
        {(["Assignment", "Exam", "Quiz"] as const).map((kind) => {
          const isActiveType = item.type === kind;
          return (
            <Pressable
              key={kind}
              onPress={() => updateItem(item.id, { type: kind })}
              style={[
                s.typeChip,
                isActiveType && [
                  s.typeChipActive,
                  { borderColor: theme.primary },
                ],
              ]}
            >
              <Text
                style={[
                  s.typeChipText,
                  isActiveType && { color: theme.primary },
                ]}
              >
                {kind}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Hurdle toggle */}
      <View style={{ marginBottom: 8 }}>
        <Pressable
          onPress={() =>
            updateItem(item.id, { hurdle: !item.hurdle })
          }
          style={[
            s.hurdleChip,
            item.hurdle && [
              s.hurdleChipActive,
              { borderColor: "#E25563" },
            ],
          ]}
        >
          <Text
            style={[
              s.hurdleChipText,
              item.hurdle && { color: "#E25563" },
            ]}
          >
            {item.hurdle
              ? "Hurdle requirement ✓"
              : "Hurdle requirement"}
          </Text>
        </Pressable>
      </View>

      {/* Weight + Grade */}
      <View style={s.row}>
        <View style={{ width: 96, flexGrow: 1 }}>
          <Text style={s.label}>Weight %</Text>
          <TextInput
            keyboardType="numeric"
            value={item.weight}
            onChangeText={(t) =>
              updateItem(item.id, {
                weight: t.replace(/[^0-9.]/g, ""),
              })
            }
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
            onChangeText={(t) =>
              updateItem(item.id, {
                grade: t.replace(/[^0-9.]/g, ""),
              })
            }
            placeholder="Result %"
            placeholderTextColor={theme.textMuted}
            style={s.input}
            returnKeyType="done"
          />
        </View>
      </View>

      {/* Per-item footer */}
      <View style={s.cardFooter}>
        <Text style={s.smallMuted}>
          {metaParts.length ? metaParts.join(" • ") : ""}
        </Text>
        <Text style={s.small}>
          Contribution:{" "}
          {(
            ((toNum(item.weight) * toNum(item.grade)) / 100 || 0)
          ).toFixed(1)}
          %
        </Text>
      </View>

      {/* Remove button */}
      <View style={[s.row, { marginTop: 12 }]}>
        <Pressable
          onPress={() => removeItem(item.id)}
          style={[s.smallBtn, { backgroundColor: theme.danger }]}
        >
          <Text style={s.smallBtnText}>Remove</Text>
        </Pressable>
      </View>
    </Animated.View>
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

  // Local form fields
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [grade, setGrade] = useState("");
  const [type, setType] = useState<Assessment["type"]>("Assignment");
  const [hurdle, setHurdle] = useState<boolean>(false);

  // Helps keep keyboard navigation smooth
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

      {/* Type selector */}
      <View style={[s.row, { marginBottom: 12 }]}>
        {(["Assignment", "Exam", "Quiz"] as const).map((kind) => {
          const isActive = type === kind;
          return (
            <Pressable
              key={kind}
              onPress={() => setType(kind)}
              style={[
                s.typeChip,
                isActive && [
                  s.typeChipActive,
                  { borderColor: theme.primary },
                ],
              ]}
            >
              <Text
                style={[
                  s.typeChipText,
                  isActive && { color: theme.primary },
                ]}
              >
                {kind}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Hurdle toggle */}
      <View style={{ marginBottom: 16 }}>
        <Pressable
          onPress={() => setHurdle((prev) => !prev)}
          style={[
            s.hurdleChip,
            hurdle && [
              s.hurdleChipActive,
              { borderColor: "#E25563" },
            ],
          ]}
        >
          <Text
            style={[
              s.hurdleChipText,
              hurdle && { color: "#E25563" },
            ]}
          >
            {hurdle
              ? "Hurdle requirement ✓"
              : "Mark as hurdle requirement"}
          </Text>
        </Pressable>
      </View>

      <View style={[s.row, { marginBottom: 16 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>Weight %</Text>
          <TextInput
            ref={weightRef}
            value={weight}
            onChangeText={(t) =>
              setWeight(t.replace(/[^0-9.]/g, ""))
            }
            keyboardType={
              Platform.OS === "ios" ? "decimal-pad" : "number-pad"
            }
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
            onChangeText={(t) =>
              setGrade(t.replace(/[^0-9.]/g, ""))
            }
            keyboardType={
              Platform.OS === "ios" ? "decimal-pad" : "number-pad"
            }
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
        <Pressable
          onPress={onCancel}
          style={[s.neutralBtn, { backgroundColor: theme.border }]}
        >
          <Text style={s.neutralBtnText}>Cancel</Text>
        </Pressable>

        <Pressable
          onPress={submit}
          style={[s.primaryBtn, { backgroundColor: theme.primary }]}
        >
          <Text style={[s.primaryBtnText, { color: theme.primaryText }]}>
            Add
          </Text>
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
      marginBottom: 0,
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
    bannerCaption: {
      color: t.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    bannerDivider: {
      height: 1,
      backgroundColor: t.border,
      marginVertical: 10,
      opacity: 0.6,
    },
    bannerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 4,
    },
    bannerStatLabel: {
      color: t.textMuted,
      fontSize: 13,
    },
    bannerStatValue: {
      color: t.text,
      fontSize: 14,
      fontWeight: "600",
    },
    bannerPassInput: {
      minWidth: 56,
      paddingHorizontal: 10,
      paddingVertical: Platform.select({ ios: 6, android: 4 }),
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
      textAlign: "center",
      color: t.text,
      backgroundColor: t.bg,
      fontSize: 13,
      fontWeight: "600",
    },

    passCard: {
      borderRadius: 18,
      padding: 14,
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
      marginBottom: 12,
    },
    passTitle: {
      color: t.text,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 2,
    },
    passSubtitle: {
      color: t.textMuted,
      fontSize: 12,
    },
    passText: {
      color: t.text,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 2,
    },
    passHighlight: {
      fontWeight: "700",
      color: t.success,
    },

    card: {
      borderRadius: 16,
      padding: 16,
      backgroundColor: t.card,
      borderColor: t.border,
      borderWidth: 1,
    },
    cardHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
    },

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

    cardFooter: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 12,
    },

    small: { color: t.text, fontSize: 12 },
    smallMuted: { color: t.textMuted, fontSize: 12 },

    smallBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
    },
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

    bottomRowEven: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      columnGap: 12,
    },

    bottomItem: { flex: 1 },
    fullWidthBtn: { width: "100%", alignItems: "center" },

    // Total weighting pill – same size as Remove subject
    weightPill: {
      width: "100%",
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      backgroundColor: t.card,
      alignItems: "center",
      justifyContent: "center",
    },
    weightPillText: {
      fontSize: 14,
      fontWeight: "600",
      textAlign: "center",
    },

    modalCard: {
      width: "100%",
      backgroundColor: t.bg,
      borderTopColor: t.border,
      borderTopWidth: 1,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 16,
    },
    modalTitle: {
      color: t.text,
      fontSize: 18,
      fontWeight: "600",
      marginBottom: 12,
    },

    primaryBtn: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 16,
      alignItems: "center",
    },
    primaryBtnText: { fontWeight: "700" },

    neutralBtn: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 16,
      alignItems: "center",
    },
    neutralBtnText: { color: t.text },

    // "Remove subject" button in footer – same size as weight pill
    removeSubjectBtn: {
      width: "100%",
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#E25563",
    },
    removeSubjectText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 14,
      textAlign: "center",
    },

    // Type chips for Assignment / Exam / Quiz
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
    typeChipActive: {
      backgroundColor: t.bg,
    },
    typeChipText: {
      fontSize: 12,
      color: t.textMuted,
      fontWeight: "600",
    },

    // Hurdle chip
    hurdleChip: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.border,
      alignSelf: "flex-start",
      backgroundColor: t.card,
    },
    hurdleChipActive: {
      backgroundColor: t.bg,
    },
    hurdleChipText: {
      fontSize: 12,
      color: t.textMuted,
      fontWeight: "600",
    },

    // Drag handle (top-right of card)
    dragHandle: {
      paddingHorizontal: 4,
      paddingVertical: 4,
      marginLeft: 4,
    },
  });
