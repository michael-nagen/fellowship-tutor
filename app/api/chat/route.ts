import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import {
  saveLearnerProfile,
  savePersonalIntro,
  validateLearningPreferences,
} from "@/lib/learner-profile";
import { readLearningMode } from "@/lib/learning-mode";
import { markAllTopicsComplete, markTopicComplete } from "@/lib/lesson-plan";
import { buildSystemPrompt } from "@/lib/prompt";
import { markComplete } from "@/lib/progress";
import {
  endTimeSession,
  extendTimeSession,
  pauseTimeSession,
  syncSessionFromLessonPlan,
} from "@/lib/time-session";
import { getLesson, loadCourse } from "@/lib/syllabus";

export const runtime = "nodejs";
export const maxDuration = 60;

const ONBOARDING_KIND = "onboarding" as const;

type ChatRequestBody = {
  messages: UIMessage[];
  courseId: string;
  lessonId: string;
};

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as ChatRequestBody;
  const { messages, courseId, lessonId } = body;

  if (!courseId || !lessonId) {
    return new Response("Missing courseId or lessonId", { status: 400 });
  }

  const course = await loadCourse(courseId);
  const lesson = getLesson(course, lessonId);
  const system = await buildSystemPrompt({ course, lesson });
  const isOnboarding = lesson.kind === ONBOARDING_KIND;
  const learningMode = await readLearningMode(courseId);
  const isTimeMode = learningMode.mode === "time" && !isOnboarding;

  const result = streamText({
    model: openai("gpt-5.5"),
    system,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(isOnboarding ? 12 : isTimeMode ? 8 : 6),
    tools: {
      ...(isOnboarding
        ? {
            save_personal_intro: tool({
              description:
                "Save the learner's preferred name and personal context from the warm intro at the start of onboarding.",
              inputSchema: z.object({
                preferredName: z
                  .string()
                  .optional()
                  .describe(
                    "How the learner wants to be addressed, if they shared one."
                  ),
                rawPersonalIntro: z
                  .string()
                  .describe(
                    "What the learner shared about themselves in their own words."
                  ),
                personalSummary: z
                  .string()
                  .describe(
                    "A warm paragraph summarising their goals, context, and tone preferences for future sessions."
                  ),
              }),
              execute: async ({
                preferredName,
                rawPersonalIntro,
                personalSummary,
              }) => {
                const profile = await savePersonalIntro({
                  preferredName,
                  rawPersonalIntro,
                  personalSummary,
                });
                return {
                  ok: true as const,
                  preferredName: profile.preferredName ?? null,
                  personalSummary: profile.personalSummary ?? null,
                  updatedAt: profile.updatedAt,
                };
              },
            }),
            save_learning_preferences: tool({
              description:
                "Save the learner's delivery preferences for future tutoring sessions. Call once near the end of onboarding, before complete_lesson.",
              inputSchema: z.object({
                rawPreferences: z
                  .string()
                  .describe(
                    "The learner's preferences in their own words, or 'Default tutoring style' if they chose defaults."
                  ),
                summary: z
                  .string()
                  .describe(
                    "A concise paragraph the tutor will follow for delivery style in all future sessions."
                  ),
              }),
              execute: async ({ rawPreferences, summary }) => {
                const isDefault =
                  rawPreferences.trim().toLowerCase() ===
                  "default tutoring style";
                if (!isDefault) {
                  const validation =
                    validateLearningPreferences(rawPreferences);
                  if (!validation.ok) {
                    return {
                      ok: false as const,
                      error: validation.reason,
                    };
                  }
                }
                const profile = await saveLearnerProfile({
                  rawPreferences,
                  preferencesSummary: summary,
                });
                return {
                  ok: true as const,
                  preferencesSummary: profile.preferencesSummary,
                  updatedAt: profile.updatedAt,
                };
              },
            }),
          }
        : {}),
      ...(lesson.outcomes.length > 0
        ? {
            mark_topic_complete: tool({
              description:
                "Mark a lesson topic complete after its checkpoint passes. Updates the learner's live lesson plan.",
              inputSchema: z.object({
                topicIndex: z
                  .number()
                  .int()
                  .min(0)
                  .describe(
                    "0-based index of the mastery outcome / topic just completed."
                  ),
              }),
              execute: async ({ topicIndex }) => {
                if (topicIndex >= lesson.outcomes.length) {
                  return {
                    ok: false as const,
                    error: `Topic index ${topicIndex} is out of range. This lesson has ${lesson.outcomes.length} topics (0–${lesson.outcomes.length - 1}).`,
                  };
                }
                const plan = await markTopicComplete({
                  courseId,
                  lesson,
                  topicIndex,
                });
                await syncSessionFromLessonPlan({
                  courseId,
                  lessonId: lesson.id,
                  topicIndex,
                });
                return {
                  ok: true as const,
                  topicIndex,
                  topicLabel: lesson.outcomes[topicIndex],
                  topics: plan.topics,
                };
              },
            }),
          }
        : {}),
      ...(isTimeMode
        ? {
            start_break: tool({
              description:
                "Pause the session clock for a break. Call when the learner wants a break or when time is up and they choose to pause.",
              inputSchema: z.object({
                breakMinutes: z
                  .number()
                  .int()
                  .min(5)
                  .max(30)
                  .describe("Break length in minutes (5, 10, or 15)."),
              }),
              execute: async ({ breakMinutes }) => {
                const session = await pauseTimeSession(courseId, breakMinutes);
                return {
                  ok: true as const,
                  breakMinutes,
                  status: session?.status ?? "paused",
                };
              },
            }),
            extend_time_session: tool({
              description:
                "Add more minutes to the session and replan additional topics. Use when the learner finishes early and wants more, or asks to extend.",
              inputSchema: z.object({
                extraMinutes: z
                  .number()
                  .int()
                  .min(15)
                  .describe("Minutes to add (typically 15 or 30)."),
              }),
              execute: async ({ extraMinutes }) => {
                const session = await extendTimeSession({
                  course,
                  courseId,
                  extraMinutes,
                });
                return {
                  ok: true as const,
                  budgetMinutes: session.budgetMinutes,
                  plannedCount: session.plannedTopics.length,
                };
              },
            }),
            end_time_session: tool({
              description:
                "End the time session. Save what was covered vs deferred. Call when time is up or the learner stops.",
              inputSchema: z.object({
                summary: z
                  .string()
                  .describe(
                    "One or two sentences: what they covered, what remains for next time."
                  ),
              }),
              execute: async ({ summary }) => {
                const session = await endTimeSession({ courseId, summary });
                return {
                  ok: true as const,
                  covered: session?.coveredKeys.length ?? 0,
                  uncovered: session?.uncoveredKeys.length ?? 0,
                  summary,
                };
              },
            }),
          }
        : {}),
      complete_lesson: tool({
        description:
          "Mark the current lesson complete. Only call this after the learner has demonstrably met every mastery outcome for the lesson.",
        inputSchema: z.object({
          lessonId: z
            .string()
            .describe(
              "The id of the lesson being completed. Must equal the active lesson id."
            ),
          reason: z
            .string()
            .describe(
              "A single sentence naming the specific behaviours that convinced you the learner reached mastery."
            ),
        }),
        execute: async ({ lessonId: completedLessonId, reason }) => {
          if (completedLessonId !== lesson.id) {
            return {
              ok: false as const,
              error: `Tried to complete "${completedLessonId}" but the active lesson is "${lesson.id}".`,
            };
          }
          const next = await markComplete(courseId, lesson.id);
          if (lesson.outcomes.length > 0) {
            await markAllTopicsComplete({ courseId, lesson });
          }
          return {
            ok: true as const,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            courseId: course.id,
            reason,
            completedLessonIds: next.completedLessonIds,
          };
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
