import React from "react";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.l.baldacchino.GradePal";

export default function FeedbackPrompt({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const leaveReview = async () => {
    onClose();
    await Linking.openURL(PLAY_STORE_URL);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={s.backdrop}>
        <View style={s.card}>
          <Text style={s.heading}>Enjoying GradePal?</Text>

          <Text style={s.subtext}>
            Your feedback helps other students discover the app.
          </Text>

          {/* ⭐⭐⭐⭐⭐ Gold Stars */}
          <View style={s.starsRow}>
            <Text style={s.star}>★</Text>
            <Text style={s.star}>★</Text>
            <Text style={s.star}>★</Text>
            <Text style={s.star}>★</Text>
            <Text style={s.star}>★</Text>
          </View>

          {/* Buttons */}
          <View style={s.buttonsRow}>
            <Pressable style={s.laterBtn} onPress={onClose}>
              <Text style={s.laterText}>Maybe later</Text>
            </Pressable>

            <Pressable style={s.reviewBtn} onPress={leaveReview}>
              <Text style={s.reviewText}>Leave a review</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (t: any) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
    },
    card: {
      width: "88%",
      borderRadius: 22,
      padding: 18,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.border,
    },
    heading: {
      textAlign: "center",
      fontSize: 20,
      fontWeight: "800",
      color: t.text,
      marginBottom: 6,
    },
    subtext: {
      textAlign: "center",
      color: t.textMuted,
      marginBottom: 16,
      fontSize: 13,
    },
    starsRow: {
      flexDirection: "row",
      justifyContent: "center",
      marginBottom: 16,
    },
    star: {
      fontSize: 32,
      marginHorizontal: 3,
      color: "#FFD700", // Gold
    },
    buttonsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 10,
    },
    laterBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: "center",
      backgroundColor: t.border,
    },
    laterText: {
      color: t.text,
      fontWeight: "600",
    },
    reviewBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: "center",
      backgroundColor: t.primary,
    },
    reviewText: {
      color: t.primaryText,
      fontWeight: "800",
    },
  });
