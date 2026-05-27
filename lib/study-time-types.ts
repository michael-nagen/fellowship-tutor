export type BreakEvent = {
  at: string;
  durationMinutes: number;
  courseId: string;
};

export type CourseStudyTime = {
  courseId: string;
  totalActiveMs: number;
  streakStartedAt: string | null;
  breakCount: number;
  breakDurationsMinutes: number[];
  /** How long each study streak lasted before the learner took a break. */
  streaksBeforeBreakMs: number[];
};

export type StudyTimeStore = {
  courses: Record<string, CourseStudyTime>;
  breakHistory: BreakEvent[];
  updatedAt: string;
};

export type StudyTimeStats = {
  courseId: string;
  totalActiveMinutes: number;
  currentStreakMinutes: number;
  breakCount: number;
  typicalBreakMinutes: number | null;
  suggestBreakAfterMinutes: number;
  lastBreakAt: string | null;
};

export const DEFAULT_SUGGEST_BREAK_MINUTES = 45;
export const MIN_SUGGEST_BREAK_MINUTES = 25;

export function formatStudyMinutes(minutes: number): string {
  if (minutes < 1) return "<1 min";
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  return `${minutes} min`;
}

export function computeSuggestBreakMinutes(course: CourseStudyTime): number {
  if (course.streaksBeforeBreakMs.length >= 2) {
    const recent = course.streaksBeforeBreakMs.slice(-6);
    const avgMs = recent.reduce((a, b) => a + b, 0) / recent.length;
    const mins = Math.round((avgMs / 60_000) * 0.88);
    return Math.max(MIN_SUGGEST_BREAK_MINUTES, Math.min(90, mins));
  }
  return DEFAULT_SUGGEST_BREAK_MINUTES;
}

export function getCurrentStreakMs(
  course: CourseStudyTime,
  now = Date.now()
): number {
  if (!course.streakStartedAt) return 0;
  return Math.max(0, now - new Date(course.streakStartedAt).getTime());
}

export function emptyCourseStudyTime(courseId: string): CourseStudyTime {
  return {
    courseId,
    totalActiveMs: 0,
    streakStartedAt: null,
    breakCount: 0,
    breakDurationsMinutes: [],
    streaksBeforeBreakMs: [],
  };
}
