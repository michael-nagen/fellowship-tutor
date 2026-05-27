import { promises as fs } from "node:fs";
import path from "node:path";
import {
  computeSuggestBreakMinutes,
  emptyCourseStudyTime,
  getCurrentStreakMs,
  type BreakEvent,
  type CourseStudyTime,
  type StudyTimeStats,
  type StudyTimeStore,
} from "./study-time-types";

const STORE_PATH = path.join(process.cwd(), "data", "learner", "study-time.json");

async function ensureDir(): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
}

async function atomicWrite(data: unknown): Promise<void> {
  const tmp = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, STORE_PATH);
}

export async function readStudyTimeStore(): Promise<StudyTimeStore> {
  await ensureDir();
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<StudyTimeStore>;
    return {
      courses: parsed.courses ?? {},
      breakHistory: Array.isArray(parsed.breakHistory) ? parsed.breakHistory : [],
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { courses: {}, breakHistory: [], updatedAt: new Date(0).toISOString() };
    }
    throw err;
  }
}

function getCourse(store: StudyTimeStore, courseId: string): CourseStudyTime {
  return store.courses[courseId] ?? emptyCourseStudyTime(courseId);
}

function typicalBreakMinutes(course: CourseStudyTime): number | null {
  if (course.breakDurationsMinutes.length === 0) return null;
  const recent = course.breakDurationsMinutes.slice(-8);
  return Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
}

export function buildStudyTimeStats(
  courseId: string,
  course: CourseStudyTime
): StudyTimeStats {
  const streakMs = getCurrentStreakMs(course);
  return {
    courseId,
    totalActiveMinutes: Math.floor(course.totalActiveMs / 60_000),
    currentStreakMinutes: Math.floor(streakMs / 60_000),
    breakCount: course.breakCount,
    typicalBreakMinutes: typicalBreakMinutes(course),
    suggestBreakAfterMinutes: computeSuggestBreakMinutes(course),
    lastBreakAt: null,
  };
}

export async function recordStudyHeartbeat(args: {
  courseId: string;
  deltaMs: number;
}): Promise<StudyTimeStats> {
  const store = await readStudyTimeStore();
  const course = getCourse(store, args.courseId);
  const now = new Date().toISOString();

  if (!course.streakStartedAt) {
    course.streakStartedAt = now;
  }

  course.totalActiveMs += Math.max(0, args.deltaMs);

  const next: StudyTimeStore = {
    ...store,
    courses: { ...store.courses, [args.courseId]: course },
    updatedAt: now,
  };
  await atomicWrite(next);
  return buildStudyTimeStats(args.courseId, course);
}

export async function recordStudyBreak(args: {
  courseId: string;
  durationMinutes: number;
}): Promise<StudyTimeStats> {
  const store = await readStudyTimeStore();
  const course = getCourse(store, args.courseId);
  const now = new Date().toISOString();

  const streakMs = getCurrentStreakMs(course);
  if (streakMs > 60_000) {
    course.streaksBeforeBreakMs = [...course.streaksBeforeBreakMs, streakMs].slice(
      -20
    );
  }

  course.breakCount += 1;
  course.breakDurationsMinutes = [
    ...course.breakDurationsMinutes,
    args.durationMinutes,
  ].slice(-20);
  course.streakStartedAt = null;

  const event: BreakEvent = {
    at: now,
    durationMinutes: args.durationMinutes,
    courseId: args.courseId,
  };

  const next: StudyTimeStore = {
    courses: { ...store.courses, [args.courseId]: course },
    breakHistory: [event, ...store.breakHistory].slice(0, 100),
    updatedAt: now,
  };
  await atomicWrite(next);

  const stats = buildStudyTimeStats(args.courseId, course);
  stats.lastBreakAt = now;
  return stats;
}

export async function getStudyTimeStats(
  courseId: string
): Promise<StudyTimeStats> {
  const store = await readStudyTimeStore();
  const course = getCourse(store, courseId);
  const stats = buildStudyTimeStats(courseId, course);
  const last = store.breakHistory.find((e) => e.courseId === courseId);
  if (last) stats.lastBreakAt = last.at;
  return stats;
}
