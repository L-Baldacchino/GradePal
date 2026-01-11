// app/_lib/timelineStorage.ts
//
// Only persists TimelineEvent[] in AsyncStorage.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { TIMELINE_KEY } from "./timelineStorageKey";
import { TimelineEvent } from "./timelineTypes";

function safeParseArray(raw: string | null): TimelineEvent[] {
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as TimelineEvent[]) : [];
  } catch {
    return [];
  }
}

/** Load timeline list */
export async function loadTimeline(): Promise<TimelineEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(TIMELINE_KEY);
    return safeParseArray(raw);
  } catch {
    return [];
  }
}

/** Save timeline list */
export async function saveTimeline(next: TimelineEvent[]): Promise<void> {
  try {
    await AsyncStorage.setItem(TIMELINE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/** Back-compat names (some files may still call these) */
export const getTimeline = loadTimeline;
export const setTimeline = saveTimeline;

export async function upsertTimelineEvent(event: TimelineEvent): Promise<void> {
  const list = await loadTimeline();
  const idx = list.findIndex((e) => e.id === event.id);
  const now = Date.now();

  const nextEvent: TimelineEvent = {
    ...event,
    updatedAt: now,
    createdAt: event.createdAt ?? now,
  };

  if (idx >= 0) {
    const next = [...list];
    next[idx] = nextEvent;
    await saveTimeline(next);
  } else {
    await saveTimeline([nextEvent, ...list]);
  }
}

export async function removeTimelineEvent(id: string): Promise<void> {
  const list = await loadTimeline();
  await saveTimeline(list.filter((e) => e.id !== id));
}

export async function removeTimelineEventsBySubject(subjectCode: string): Promise<void> {
  const code = subjectCode.toUpperCase();
  const list = await loadTimeline();
  await saveTimeline(list.filter((e) => (e.subjectCode ?? "").toUpperCase() !== code));
}

/**
 * Helper: keep timeline sorted by date then createdAt.
 * Optional if your UI sorts elsewhere.
 */
export function sortTimeline(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => {
    const da = a.dateISO ?? "";
    const db = b.dateISO ?? "";
    if (da < db) return -1;
    if (da > db) return 1;
    return (a.createdAt ?? 0) - (b.createdAt ?? 0);
  });
}

/**
 * Back-compat no-op functions (in case other files still import/call them).
 * These do nothing now, but keep the app compiling while you clean callers.
 */
export async function cancelAllRemindersForEvent(_eventId: string): Promise<void> {
  // no-op (notifications removed)
}

export async function resyncRemindersForEvent(_eventId: string): Promise<void> {
  // no-op (notifications removed)
}

export async function saveEventAndResyncReminders(event: TimelineEvent): Promise<void> {
  // keep behavior: just save the event
  await upsertTimelineEvent(event);
}

// Expo Router warning silencer (if your router is scanning _lib)
export default function _TimelineStorageRoute() {
  return null;
}
