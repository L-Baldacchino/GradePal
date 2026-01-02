// app/(tabs)/index.tsx

import React, { useCallback, useEffect, useRef, useState } from "react";
// Persist subjects locally so they survive app restarts
import AsyncStorage from "@react-native-async-storage/async-storage";
// Navigation into the per-subject grade planner screen
import { useFocusEffect, useRouter } from "expo-router";
import {
  Alert,
  Animated,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
// Theming hook so colors adapt to light/dark palettes
import { useTheme } from "../../theme/ThemeProvider";
// Draggable list for reordering subjects by long-press + drag
import DraggableFlatList, {
  RenderItemParams,
} from "react-native-draggable-flatlist";

// Simple shape for a subject row on the home screen
type Subject = {
  code: string;
  name: string;
};

// Where we store the subjects list in AsyncStorage
const STORAGE_KEY = "subjects-list:v1";

// Feedback-related keys + constants
const FIRST_OPEN_KEY = "meta:first-open-at"; // first time app opened
const FEEDBACK_PROMPTED_KEY = "meta:feedback-prompted"; // "true" => never ask again
const FEEDBACK_SNOOZE_KEY = "meta:feedback-snooze-at"; // timestamp of "maybe later"

// Tutorial key
const TUTORIAL_SEEN_KEY = "meta:subjects-tutorial-seen";

// ⏱ For testing: 10 seconds.
// For production, change to: 24 * 60 * 60 * 1000 (24 hours)
const INITIAL_FEEDBACK_DELAY_MS = 10 * 1000;

// ⏱ Snooze duration after "Maybe later": 4 weeks
const FEEDBACK_SNOOZE_DELAY_MS = 28 * 24 * 60 * 60 * 1000;

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.l.baldacchino.GradePal";

/** ---------- Row component with wobble animation while dragging ---------- */

type SubjectRowProps = {
  item: Subject;
  drag: () => void;
  isActive: boolean;
  theme: any;
  styles: ReturnType<typeof makeStyles>;
};

const SubjectRow: React.FC<SubjectRowProps> = ({
  item,
  drag,
  isActive,
  theme,
  styles,
}) => {
  const router = useRouter();
  const wobbleAnim = useRef(new Animated.Value(0)).current;

  // Wobble effect when the row is actively being dragged
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
    transform: [{ translateX: wobbleAnim }, { scale: isActive ? 1.02 : 1 }],
    opacity: isActive ? 0.95 : 1,
  };

  return (
    <Animated.View style={[styles.subjectCard, animatedStyle]}>
      {/* Tap left side to open the grade planner */}
      <Pressable
        style={{ flex: 1 }}
        onPress={() =>
          router.push(`/grade-planner/${encodeURIComponent(item.code)}`)
        }
      >
        <Text>
          <Text style={styles.subjectCode}>{item.code}</Text>
          <Text style={styles.subjectName}> – {item.name}</Text>
        </Text>
      </Pressable>

      {/* Drag handle – long-press and drag this icon */}
      <Pressable
        onLongPress={drag}
        delayLongPress={150}
        style={styles.dragHandle}
        hitSlop={10}
      >
        <Text style={{ color: theme.textMuted, fontSize: 18 }}>≡</Text>
      </Pressable>
    </Animated.View>
  );
};

/** ---------- Main screen ---------- */

export default function SubjectsScreen() {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  // Local state for the list and the form inputs
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  // Prevent multiple feedback checks in a single app session
  const [feedbackChecked, setFeedbackChecked] = useState(false);
  // Controls the custom in-app feedback modal visibility
  const [showFeedback, setShowFeedback] = useState(false);

  // Tutorial visibility
  const [showTutorial, setShowTutorial] = useState(false);

  // Load subjects from storage
  const loadSubjects = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = saved ? (JSON.parse(saved) as Subject[]) : [];
      setSubjects(parsed);

      // If there are no subjects, and tutorial hasn't been seen, show it
      if (!parsed || parsed.length === 0) {
        const seen = await AsyncStorage.getItem(TUTORIAL_SEEN_KEY);
        if (seen !== "true") {
          setShowTutorial(true);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Check if we should prompt for Play Store feedback
  const checkFeedbackPrompt = useCallback(async () => {
    try {
      // Only show this on Android, since the link is for Google Play
      if (Platform.OS !== "android") return;

      if (feedbackChecked) return; // already handled this session

      const now = Date.now();

      // Has user already permanently dismissed by leaving a review?
      const promptedFlag = await AsyncStorage.getItem(FEEDBACK_PROMPTED_KEY);
      if (promptedFlag === "true") {
        setFeedbackChecked(true);
        return;
      }

      // Get or set the first-open timestamp
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

      // Has it been at least INITIAL_FEEDBACK_DELAY_MS since first open?
      if (now - firstOpen < INITIAL_FEEDBACK_DELAY_MS) {
        setFeedbackChecked(true);
        return;
      }

      // Check if user hit "Maybe later" recently and we're still in snooze period
      const snoozeRaw = await AsyncStorage.getItem(FEEDBACK_SNOOZE_KEY);
      if (snoozeRaw) {
        const snoozeAt = parseInt(snoozeRaw, 10);
        if (Number.isFinite(snoozeAt) && now - snoozeAt < FEEDBACK_SNOOZE_DELAY_MS) {
          setFeedbackChecked(true);
          return;
        }
      }

      // ✅ Time to ask for feedback via custom modal
      setFeedbackChecked(true);
      setShowFeedback(true);
    } catch {
      // Silent fail – we don't want feedback logic to break the app
      setFeedbackChecked(true);
    }
  }, [feedbackChecked]);

  // Initial load on mount
  useEffect(() => {
    loadSubjects();
    checkFeedbackPrompt();
  }, [loadSubjects, checkFeedbackPrompt]);

  // 🔄 Reload subjects + re-check feedback whenever this screen gains focus
  useFocusEffect(
    useCallback(() => {
      loadSubjects();
      checkFeedbackPrompt();
    }, [loadSubjects, checkFeedbackPrompt])
  );

  // Add a subject row, with basic validation and duplicate-code guard
  const addSubject = () => {
    if (!code.trim() || !name.trim()) {
      Alert.alert("Missing info", "Please enter both code and name.");
      return;
    }

    const exists = subjects.some(
      (s) => s.code.toUpperCase() === code.trim().toUpperCase()
    );
    if (exists) {
      Alert.alert("Duplicate", "This subject code already exists.");
      return;
    }

    const newSub: Subject = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
    };

    // Newest subject at the top
    const updated = [newSub, ...subjects];

    setSubjects(updated);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});

    setCode("");
    setName("");
  };

  // When list order changes via drag, save immediately
  const handleReorder = (data: Subject[]) => {
    setSubjects(data);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
  };

  // Tutorial: mark as seen and hide
  const finishTutorial = () => {
    setShowTutorial(false);
    AsyncStorage.setItem(TUTORIAL_SEEN_KEY, "true").catch(() => {});
  };

  // Wire SubjectRow into DraggableFlatList
  const renderItem = (params: RenderItemParams<Subject>) => {
    const { item, drag, isActive } = params;
    return (
      <SubjectRow
        item={item}
        drag={drag}
        isActive={isActive}
        theme={theme}
        styles={s}
      />
    );
  };

  return (
    <View style={[s.screen]}>
      {/* Page heading + short explainer */}
      <Text style={s.title}>Subjects</Text>
      <Text style={s.subtitle}>
        Add your units, then tap to open each calculator. Long-press the ≡
        handle to reorder.
      </Text>

      <View style={s.divider} />

      {/* Inline add form: subject code on the left, name on the right, and an Add button */}
      <View style={s.row}>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="e.g. CSE3CAP"
          placeholderTextColor={theme.textMuted}
          style={[s.inputCompact, { flexBasis: 130 }]}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Capstone Project"
          placeholderTextColor={theme.textMuted}
          style={[s.inputCompact, { flex: 1 }]}
          autoCapitalize="words"
          autoCorrect={false}
        />
        <Pressable
          onPress={addSubject}
          style={[s.primaryBtn, { backgroundColor: theme.primary }]}
        >
          <Text style={[s.primaryBtnText, { color: theme.primaryText }]}>
            Add
          </Text>
        </Pressable>
      </View>

      {/* Draggable subjects list */}
      <DraggableFlatList<Subject>
        data={subjects}
        keyExtractor={(item) => item.code}
        contentContainerStyle={{ paddingBottom: 60 }}
        renderItem={renderItem}
        onDragEnd={({ data }) => handleReorder(data)}
      />

      {/* --------- Tutorial overlay (only if no subjects + not seen before) --------- */}
      {showTutorial && (
        <View style={s.tutorialOverlay}>
          <View
            style={[
              s.tutorialCard,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text style={[s.tutorialTitle, { color: theme.text }]}>
              Welcome to Grade Pal 👋
            </Text>
            <Text style={[s.tutorialBody, { color: theme.textMuted }]}>
              Let&apos;s add your first subject:
              {"\n\n"}1. Enter your subject code (e.g. CSE3MAD).
              {"\n"}2. Add the subject name (e.g. Mobile App Development).
              {"\n"}3. Tap &quot;Add&quot; to create the subject.
              {"\n"}4. Once you added your subject, tap it to open the grade planner!
              {"\n\n"}Enjoy! ❤️
            </Text>

            <Pressable
              style={[s.tutorialPrimaryBtn, { backgroundColor: theme.primary }]}
              onPress={finishTutorial}
            >
              <Text
                style={[
                  s.tutorialPrimaryText,
                  { color: theme.primaryText },
                ]}
              >
                Got it, let&apos;s add a subject
              </Text>
            </Pressable>

            
          </View>
        </View>
      )}

      {/* --------- Custom in-app feedback prompt overlay --------- */}
      {showFeedback && !showTutorial && (
        <View style={s.feedbackOverlay}>
          <View
            style={[
              s.feedbackCard,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text style={[s.feedbackTitle, { color: theme.text }]}>
              Enjoying Grade Pal?
            </Text>

            {/* ⭐⭐⭐⭐⭐ */}
            <View style={s.starsRow}>
              <Text style={s.star}>⭐</Text>
              <Text style={s.star}>⭐</Text>
              <Text style={s.star}>⭐</Text>
              <Text style={s.star}>⭐</Text>
              <Text style={s.star}>⭐</Text>
            </View>

            <Text style={[s.feedbackSubtitle, { color: theme.textMuted }]}>
              If Grade Pal has helped you understand your grades, please
              consider leaving a quick review 💛
            </Text>

            {/* BIG PRIMARY BUTTON */}
            <Pressable
              style={[s.reviewButton, { backgroundColor: theme.primary }]}
              onPress={() => {
                // Mark as permanently done – never show again
                AsyncStorage.setItem(FEEDBACK_PROMPTED_KEY, "true").catch(
                  () => {}
                );
                setShowFeedback(false);
                Linking.openURL(PLAY_STORE_URL).catch(() => {
                  Alert.alert(
                    "Unable to open Play Store",
                    "Please search for 'Grade Pal' on the Play Store to leave a review."
                  );
                });
              }}
            >
              <Text
                style={[
                  s.reviewButtonText,
                  { color: theme.primaryText },
                ]}
              >
                Leave a Review
              </Text>
            </Pressable>

            {/* LOW-EMPHASIS LINK UNDER BUTTON */}
            <Pressable
              onPress={() => {
                // Snooze for 4 weeks
                AsyncStorage.setItem(
                  FEEDBACK_SNOOZE_KEY,
                  String(Date.now())
                ).catch(() => {});
                setShowFeedback(false);
              }}
              style={s.maybeLaterWrapper}
            >
              <Text
                style={[s.maybeLaterText, { color: theme.textMuted }]}
              >
                Maybe later
              </Text>
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
    // Compact inputs so all three controls comfortably fit on one row
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
    // Each subject row card
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
    // Bold code (e.g., CSE3MAD)
    subjectCode: {
      color: t.text,
      fontWeight: "700",
      fontSize: 15,
    },
    // Lighter title that follows the en dash
    subjectName: {
      color: t.textMuted,
      fontSize: 15,
      fontWeight: "400",
    },
    // Drag handle on the right
    dragHandle: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginLeft: 8,
    },
    // Primary “Add” button next to the inputs
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

    /* ---------- Tutorial styles ---------- */
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
    tutorialCard: {
      width: "100%",
      borderRadius: 20,
      paddingVertical: 20,
      paddingHorizontal: 18,
      borderWidth: 1,
      alignItems: "center",
    },
    tutorialTitle: {
      fontSize: 18,
      fontWeight: "700",
      marginBottom: 8,
      textAlign: "center",
    },
    tutorialBody: {
      fontSize: 14,
      textAlign: "left",
      lineHeight: 20,
      marginBottom: 16,
    },
    tutorialPrimaryBtn: {
      width: "100%",
      paddingVertical: 12,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    tutorialPrimaryText: {
      fontSize: 15,
      fontWeight: "700",
    },
    tutorialSkipBtn: {
      marginTop: 8,
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    tutorialSkipText: {
      fontSize: 13,
      textDecorationLine: "underline",
    },

    /* ---------- Feedback modal styles ---------- */
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
    feedbackCard: {
      width: "100%",
      borderRadius: 22,
      padding: 18,
      alignItems: "center",
      borderWidth: 1,
    },
    feedbackTitle: {
      fontSize: 20,
      fontWeight: "800",
      marginBottom: 6,
    },
    starsRow: {
      flexDirection: "row",
      gap: 4,
      marginVertical: 6,
    },
    star: {
      fontSize: 26,
      color: "#FFD43B",
    },
    feedbackSubtitle: {
      fontSize: 13,
      textAlign: "center",
      marginBottom: 16,
      lineHeight: 18,
    },
    reviewButton: {
      width: "100%",
      paddingVertical: 14,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    reviewButtonText: {
      fontSize: 16,
      fontWeight: "800",
    },
    maybeLaterWrapper: {
      marginTop: 10,
      paddingVertical: 6,
    },
    maybeLaterText: {
      fontSize: 13,
      fontWeight: "600",
    },
  });
