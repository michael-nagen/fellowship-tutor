import { promises as fs } from "node:fs";
import path from "node:path";
import {
  formatLearnerPreferencesForPrompt,
  readLearnerProfile,
} from "./learner-profile";
import { formatLearningModeForPrompt } from "./learning-mode-prompt";
import { readLessonNotebook } from "./notebook";
import type { Course, Lesson } from "./syllabus";

const DATA_DIR = path.join(process.cwd(), "data");
const DEFAULT_PROMPT_PATH = path.join(DATA_DIR, "prompt.md");

export async function buildSystemPrompt(args: {
  course: Course;
  lesson: Lesson;
}): Promise<string> {
  const promptPath = args.lesson.promptPath
    ? path.join(DATA_DIR, args.lesson.promptPath)
    : DEFAULT_PROMPT_PATH;
  const template = await fs.readFile(promptPath, "utf8");
  const outcomes = args.lesson.outcomes
    .map((o, i) => `${i + 1}. ${o}`)
    .join("\n");
  const profile = await readLearnerProfile();
  const learnerPreferences = formatLearnerPreferencesForPrompt(profile);
  const learningModeContext = await formatLearningModeForPrompt({
    courseId: args.course.id,
    course: args.course,
    lesson: args.lesson,
  });
  const notebookEntry = await readLessonNotebook(args.course.id, args.lesson.id);
  const lessonNotebook =
    notebookEntry.content.trim().length > 0
      ? notebookEntry.content.trim()
      : "(The learner has not written anything in their notebook for this lesson yet.)";

  return template
    .replaceAll("{{courseTitle}}", args.course.title)
    .replaceAll("{{lessonTitle}}", args.lesson.title)
    .replaceAll("{{lessonOutcomes}}", outcomes)
    .replaceAll("{{learnerPreferences}}", learnerPreferences)
    .replaceAll("{{learningModeContext}}", learningModeContext)
    .replaceAll("{{lessonNotebook}}", lessonNotebook);
}
