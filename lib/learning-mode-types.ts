export type LearningMode = "lessons" | "time";

export type LearningModeSettings = {
  mode: LearningMode;
  timeBudgetMinutes?: number;
  sessionStartedAt?: string;
  updatedAt: string;
};

export const MIN_TIME_MINUTES = 15;
export const TIME_PRESETS = [15, 30, 45, 60, 90, 120] as const;

export function getTimeRemainingMinutes(
  settings: LearningModeSettings
): number | null {
  if (settings.mode !== "time" || !settings.timeBudgetMinutes) return null;
  const started = settings.sessionStartedAt
    ? new Date(settings.sessionStartedAt).getTime()
    : Date.now();
  const elapsed = Math.floor((Date.now() - started) / 60_000);
  return Math.max(0, settings.timeBudgetMinutes - elapsed);
}
