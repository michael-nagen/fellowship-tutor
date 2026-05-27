import { readLessonPlan } from "./lesson-plan";
import { readLearningMode } from "./learning-mode";
import {
  formatSessionPlanForPrompt,
  readTimeSession,
  startTimeSession,
  isSessionStale,
} from "./time-session";
import { getEffectiveRemainingMinutes } from "./time-session-types";
import type { Course, Lesson } from "./syllabus";

export async function formatLearningModeForPrompt(args: {
  course: Course;
  courseId: string;
  lesson: Lesson;
}): Promise<string> {
  const settings = await readLearningMode(args.courseId);

  const syncNote =
    "Progress is shared across modes: completed topics persist in the lesson plan when switching modes.";

  if (settings.mode !== "time") {
    const plan = await readLessonPlan(args.courseId, args.lesson);
    const total = plan.topics.length;
    const completed = plan.topics.filter((t) => t === "completed").length;
    return [
      "The learner is in **lesson-based mode**.",
      "",
      `${completed} of ${total} topics completed in "${args.lesson.title}".`,
      syncNote,
      "",
      "Work toward completing **every** mastery outcome for this lesson, then call `complete_lesson`.",
      "Use the standard lesson roadmap (estimate ~10–15 min per topic).",
    ].join("\n");
  }

  let session = await readTimeSession(args.courseId);
  if (
    !session ||
    session.status === "ended" ||
    isSessionStale(session, args.course)
  ) {
    session = await startTimeSession({
      course: args.course,
      courseId: args.courseId,
      budgetMinutes: settings.timeBudgetMinutes ?? 30,
    });
  }

  const remaining = getEffectiveRemainingMinutes({
    budgetMinutes: session.budgetMinutes,
    startedAt: session.startedAt,
    accumulatedPauseMs: session.accumulatedPauseMs,
    pausedAt: session.pausedAt,
    status: session.status,
  });

  return [
    "The learner is in **time-based mode** — a full study session alternative to lesson-by-lesson mode.",
    "The curriculum below is **binding**: every listed **subject topic** should be taught with full checkpoints, paced to the clock. Sessions may span multiple sidebar lessons.",
    "",
    formatSessionPlanForPrompt(session, remaining),
    "",
    syncNote,
    "",
    "**Time-mode tools:**",
    "- `start_break(breakMinutes)` — pause the clock for a break (5, 10, or 15).",
    "- `extend_time_session(extraMinutes)` — add time and replan extra topics if they want to continue.",
    "- `end_time_session(summary)` — when time is up or they stop; save covered vs deferred (one sentence summary).",
  ].join("\n");
}
