import { promises as fs } from "node:fs";
import path from "node:path";
import type { CoworkMode } from "./cowork-types";
import type { Course, Lesson } from "./syllabus";

const DATA_DIR = path.join(process.cwd(), "data");

export async function buildCoworkPrompt(args: {
  mode: CoworkMode;
  course: Course;
  lesson: Lesson;
}): Promise<string> {
  const file =
    args.mode === "friend" ? "prompt-friend.md" : "prompt-study-buddy.md";
  const template = await fs.readFile(path.join(DATA_DIR, file), "utf8");
  const outcomes = args.lesson.outcomes
    .map((o, i) => `${i + 1}. ${o}`)
    .join("\n");

  return template
    .replaceAll("{{courseTitle}}", args.course.title)
    .replaceAll("{{lessonTitle}}", args.lesson.title)
    .replaceAll("{{lessonOutcomes}}", outcomes);
}
