// app/_lib/timelineTypes.ts

export type TimelineKind = "assessment" | "exam" | "lecture" | "holiday" | "todo" | "custom";

export type TimelineReminder = {
  id: string; // stable id for this reminder row
  minutesBefore: number; // e.g. 60, 1440
  notificationId?: string | null; // expo-notifications scheduled id
};

// Back-compat alias (some files may import ReminderRule)
export type ReminderRule = TimelineReminder;

export type TimelineEvent = {
  id: string;

  title: string;
  dateISO: string; // YYYY-MM-DD

  kind: TimelineKind;
  customLabel?: string;
  subjectCode?: string; // e.g. CSE3MAD
  weight?: number; // for assessments/exams
  grade?: number; // if present -> completed for assessments/exams

  isComplete?: boolean; // used for todo/manual items
  notes?: string;

  // legacy single notification field (some old code might still write this)
  notificationId?: string | null;

  // preferred
  reminders?: TimelineReminder[];

  // metadata
  createdAt: number;
  updatedAt: number;
};

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function isoToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

export function isCompleted(e: TimelineEvent): boolean {
  if (e.kind === "assessment" || e.kind === "exam") {
    return typeof e.grade === "number" && Number.isFinite(e.grade);
  }
  return !!e.isComplete;
}

export function safeUpper(s?: string) {
  return String(s ?? "").toUpperCase();
}

export function isoToDateParts(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

// Expo Router warning silencer (if your router is scanning _lib)
export default function _TimelineTypesRoute() {
  return null;
}
