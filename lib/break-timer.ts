import { BREAK_PRESETS } from "./time-session-types";

export type StudyBreakRecord = {
  courseId: string;
  startedAt: string;
  durationMinutes: number;
};

const STORAGE_PREFIX = "study-break-";

export function breakStorageKey(courseId: string): string {
  return `${STORAGE_PREFIX}${courseId}`;
}

export function readStoredBreak(courseId: string): StudyBreakRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(breakStorageKey(courseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StudyBreakRecord;
    if (parsed.courseId !== courseId || !parsed.startedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredBreak(record: StudyBreakRecord | null): void {
  if (typeof window === "undefined") return;
  const key = breakStorageKey(record?.courseId ?? "");
  if (!record) {
    sessionStorage.removeItem(key);
    return;
  }
  sessionStorage.setItem(key, JSON.stringify(record));
}

export function getBreakRemainingSeconds(record: StudyBreakRecord): number {
  const endsAt =
    new Date(record.startedAt).getTime() + record.durationMinutes * 60_000;
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

export function isBreakExpired(record: StudyBreakRecord): boolean {
  return getBreakRemainingSeconds(record) <= 0;
}

export function formatBreakCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export { BREAK_PRESETS };

export function notifyBreakEnded(): void {
  if (typeof window === "undefined") return;

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Break time is up", {
      body: "Ready to get back to studying?",
      icon: "/favicon.ico",
    });
  }

  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 587.33;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // optional gentle chime
  }
}

export async function ensureNotificationPermission(): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
}
