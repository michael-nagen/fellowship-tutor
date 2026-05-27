import { promises as fs } from "node:fs";
import path from "node:path";
import type { Course, Lesson } from "./syllabus";

const PROMPT_PATH = path.join(process.cwd(), "data", "prompt-deep-dive.md");

export async function buildDeepDivePrompt(args: {
  course: Course;
  lesson: Lesson;
  topicLabel: string;
}): Promise<string> {
  const template = await fs.readFile(PROMPT_PATH, "utf8");
  return template
    .replaceAll("{{courseTitle}}", args.course.title)
    .replaceAll("{{lessonTitle}}", args.lesson.title)
    .replaceAll("{{topicLabel}}", args.topicLabel);
}
