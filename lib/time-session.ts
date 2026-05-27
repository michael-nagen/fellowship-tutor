import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { readLessonPlan } from "./lesson-plan";
import { readProgress } from "./progress";
import type { Course, Lesson } from "./syllabus";
import {
  formatBudgetLabel,
  groupSessionTopics,
  MINUTES_PER_TOPIC,
  maxTopicsForMinutes,
  topicKey,
  type SessionTopic,
  type TimeSessionRecord,
} from "./time-session-types";

const SESSION_DIR = path.join(process.cwd(), "data", "learner");

function sessionPath(courseId: string): string {
  return path.join(SESSION_DIR, `time-session-${courseId}.json`);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(SESSION_DIR, { recursive: true });
}

async function atomicWrite(filePath: string, data: unknown): Promise<void> {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

async function collectIncompleteTopics(
  course: Course,
  courseId: string
): Promise<SessionTopic[]> {
  const progress = await readProgress(courseId);
  const completedLessons = new Set(progress.completedLessonIds);
  const queue: SessionTopic[] = [];

  for (const lesson of course.lessons) {
    if (lesson.kind === "onboarding") continue;
    if (completedLessons.has(lesson.id)) continue;
    const plan = await readLessonPlan(courseId, lesson);
    lesson.outcomes.forEach((label, topicIndex) => {
      const status = plan.topics[topicIndex] ?? "pending";
      if (status !== "completed") {
        queue.push({
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          topicIndex,
          label,
          estimatedMinutes: MINUTES_PER_TOPIC,
        });
      }
    });
  }

  return queue;
}

export function isSessionStale(
  session: TimeSessionRecord,
  course: Course
): boolean {
  const onboardingIds = new Set(
    course.lessons.filter((l) => l.kind === "onboarding").map((l) => l.id)
  );
  if (onboardingIds.size === 0) return false;
  return session.plannedTopics.some((t) => onboardingIds.has(t.lessonId));
}

export function splitTopicsForBudget(
  allIncomplete: SessionTopic[],
  budgetMinutes: number
): Pick<
  TimeSessionRecord,
  "plannedTopics" | "bonusTopics" | "deferredTopics"
> {
  const maxPrimary = maxTopicsForMinutes(budgetMinutes);
  const plannedTopics = allIncomplete.slice(0, maxPrimary);
  const rest = allIncomplete.slice(maxPrimary);
  const bonusTopics = rest.slice(0, 2);
  const deferredTopics = rest.slice(2);

  return { plannedTopics, bonusTopics, deferredTopics };
}

export async function buildTimeSessionPlan(args: {
  course: Course;
  courseId: string;
  budgetMinutes: number;
}): Promise<
  Pick<
    TimeSessionRecord,
    "plannedTopics" | "bonusTopics" | "deferredTopics"
  >
> {
  const incomplete = await collectIncompleteTopics(args.course, args.courseId);
  return splitTopicsForBudget(incomplete, args.budgetMinutes);
}

export async function readTimeSession(
  courseId: string
): Promise<TimeSessionRecord | null> {
  await ensureDir();
  try {
    const raw = await fs.readFile(sessionPath(courseId), "utf8");
    return JSON.parse(raw) as TimeSessionRecord;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function startTimeSession(args: {
  course: Course;
  courseId: string;
  budgetMinutes: number;
}): Promise<TimeSessionRecord> {
  const plan = await buildTimeSessionPlan(args);
  const now = new Date().toISOString();
  const record: TimeSessionRecord = {
    sessionId: nanoid(),
    courseId: args.courseId,
    budgetMinutes: args.budgetMinutes,
    startedAt: now,
    status: "active",
    accumulatedPauseMs: 0,
    plannedTopics: plan.plannedTopics,
    bonusTopics: plan.bonusTopics,
    deferredTopics: plan.deferredTopics,
    coveredKeys: [],
    uncoveredKeys: [],
    updatedAt: now,
  };
  await atomicWrite(sessionPath(args.courseId), record);
  return record;
}

export async function saveTimeSession(
  record: TimeSessionRecord
): Promise<TimeSessionRecord> {
  await ensureDir();
  const next = { ...record, updatedAt: new Date().toISOString() };
  await atomicWrite(sessionPath(record.courseId), next);
  return next;
}

export async function syncSessionFromLessonPlan(args: {
  courseId: string;
  lessonId: string;
  topicIndex: number;
}): Promise<void> {
  const session = await readTimeSession(args.courseId);
  if (!session || session.status === "ended") return;
  const key = topicKey(args.lessonId, args.topicIndex);
  if (session.coveredKeys.includes(key)) return;

  const inPlan = [...session.plannedTopics, ...session.bonusTopics].some(
    (t) => topicKey(t.lessonId, t.topicIndex) === key
  );
  if (!inPlan) return;

  const coveredKeys = [...session.coveredKeys, key];
  const plannedKeys = session.plannedTopics.map((t) =>
    topicKey(t.lessonId, t.topicIndex)
  );
  const uncoveredKeys = plannedKeys.filter((k) => !coveredKeys.includes(k));

  await saveTimeSession({
    ...session,
    coveredKeys,
    uncoveredKeys,
  });
}

export async function extendTimeSession(args: {
  course: Course;
  courseId: string;
  extraMinutes: number;
}): Promise<TimeSessionRecord> {
  const session = await readTimeSession(args.courseId);
  if (!session) {
    return startTimeSession({
      course: args.course,
      courseId: args.courseId,
      budgetMinutes: args.extraMinutes,
    });
  }

  const newBudget = session.budgetMinutes + args.extraMinutes;
  const addCount = maxTopicsForMinutes(args.extraMinutes);
  const covered = new Set(session.coveredKeys);

  const incomplete = await collectIncompleteTopics(args.course, args.courseId);
  const inSession = new Set(
    [...session.plannedTopics, ...session.bonusTopics, ...session.deferredTopics].map(
      (t) => topicKey(t.lessonId, t.topicIndex)
    )
  );

  const pool: SessionTopic[] = [];
  const seen = new Set<string>();
  const push = (t: SessionTopic) => {
    const k = topicKey(t.lessonId, t.topicIndex);
    if (covered.has(k) || seen.has(k)) return;
    seen.add(k);
    pool.push(t);
  };

  for (const t of session.deferredTopics) push(t);
  for (const t of session.bonusTopics) push(t);
  for (const t of incomplete) {
    if (!inSession.has(topicKey(t.lessonId, t.topicIndex))) push(t);
  }

  const toAdd = pool.slice(0, addCount);
  const newDeferred = pool.slice(addCount);

  return saveTimeSession({
    ...session,
    budgetMinutes: newBudget,
    status: "active",
    pausedAt: undefined,
    plannedTopics: [...session.plannedTopics, ...toAdd],
    deferredTopics: newDeferred,
  });
}

export async function pauseTimeSession(
  courseId: string,
  breakMinutes?: number
): Promise<TimeSessionRecord | null> {
  const session = await readTimeSession(courseId);
  if (!session || session.status !== "active") return session;
  return saveTimeSession({
    ...session,
    status: "paused",
    pausedAt: new Date().toISOString(),
    intendedBreakMinutes:
      breakMinutes && breakMinutes > 0 ? breakMinutes : undefined,
  });
}

export async function resumeTimeSession(args: {
  courseId: string;
  breakMinutes?: number;
}): Promise<TimeSessionRecord | null> {
  const session = await readTimeSession(args.courseId);
  if (!session) return null;

  let accumulatedPauseMs = session.accumulatedPauseMs;
  if (session.pausedAt) {
    const breakMins =
      args.breakMinutes ?? session.intendedBreakMinutes;
    const pauseDuration = breakMins
      ? breakMins * 60_000
      : Date.now() - new Date(session.pausedAt).getTime();
    accumulatedPauseMs += pauseDuration;
  }

  return saveTimeSession({
    ...session,
    status: "active",
    pausedAt: undefined,
    intendedBreakMinutes: undefined,
    accumulatedPauseMs,
  });
}

export async function endTimeSession(args: {
  courseId: string;
  summary: string;
}): Promise<TimeSessionRecord | null> {
  const session = await readTimeSession(args.courseId);
  if (!session) return null;

  const plannedKeys = session.plannedTopics.map((t) =>
    topicKey(t.lessonId, t.topicIndex)
  );
  const uncoveredKeys = plannedKeys.filter(
    (k) => !session.coveredKeys.includes(k)
  );

  return saveTimeSession({
    ...session,
    status: "ended",
    pausedAt: undefined,
    uncoveredKeys,
    lastSummary: args.summary,
  });
}

export function formatSessionPlanForPrompt(
  session: TimeSessionRecord,
  remainingMinutes: number
): string {
  const budgetLabel = formatBudgetLabel(session.budgetMinutes);
  const lessonGroups = groupSessionTopics(session.plannedTopics);
  const lines: string[] = [
    `**Session budget:** ${budgetLabel} (${session.budgetMinutes} min total), **~${remainingMinutes} minutes left**${session.status === "paused" ? " (paused)" : ""}.`,
    "",
    `**Full session curriculum** — ${session.plannedTopics.length} subject topic(s) across ${lessonGroups.length} lesson(s), ~${MINUTES_PER_TOPIC} min each including checkpoints:`,
  ];

  if (session.plannedTopics.length === 0) {
    lines.push(
      "- No subject topics fit in this budget — suggest extending time or switching to lesson mode."
    );
  } else {
    for (const group of lessonGroups) {
      lines.push("", `### ${group.lessonTitle}`);
      group.topics.forEach((t, i) => {
        const key = topicKey(t.lessonId, t.topicIndex);
        const done = session.coveredKeys.includes(key);
        lines.push(
          `${i + 1}. ${done ? "✓" : "○"} ${t.label} (~${t.estimatedMinutes} min)`
        );
      });
    }
  }

  lines.push(
    "",
    "**Rules for this session:**",
    `- This is a **full study session**, not a single sidebar lesson. Cover all ${session.plannedTopics.length} planned topic(s) above at normal mastery depth (MC + teach-back per topic).`,
    "- Work in lesson order as listed. Call `mark_topic_complete` after each topic is mastered.",
    "- Open your first turn with this full curriculum and total time — do NOT describe the whole course, only what fits this session.",
    `- When ~${Math.min(5, remainingMinutes)} minutes remain, warn the learner and finish the current checkpoint or wrap up.`,
    "- When time is up OR the learner asks to stop: call `end_time_session` with a summary of covered vs deferred topics, then offer a break (5/10/15 min) or saving progress and returning later.",
    "- If ALL planned topics are done with 12+ minutes left: teach bonus topics in order, then offer `extend_time_session` if they want more.",
    "- Do NOT teach onboarding/meta content — only course subject outcomes."
  );

  if (session.bonusTopics.length > 0) {
    lines.push("", "**Bonus (only after planned topics, if time left):**");
    session.bonusTopics.forEach((t, i) => {
      lines.push(`${i + 1}. [${t.lessonTitle}] ${t.label}`);
    });
  }

  if (session.deferredTopics.length > 0) {
    lines.push("", "**Deferred to a future session (mention at wrap-up):**");
    session.deferredTopics.slice(0, 8).forEach((t, i) => {
      lines.push(`${i + 1}. [${t.lessonTitle}] ${t.label}`);
    });
    if (session.deferredTopics.length > 8) {
      lines.push(`…and ${session.deferredTopics.length - 8} more.`);
    }
  }

  if (session.coveredKeys.length > 0 || session.uncoveredKeys.length > 0) {
    lines.push(
      "",
      `**Saved progress this session:** ${session.coveredKeys.length} covered, ${session.uncoveredKeys.length} still to go from the plan.`
    );
  }

  return lines.join("\n");
}
