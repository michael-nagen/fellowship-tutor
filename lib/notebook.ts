import { promises as fs } from "node:fs";
import path from "node:path";

export type CourseNotebook = {
  lessons: Record<string, { content: string; updatedAt: string }>;
  updatedAt: string;
};

const NOTEBOOK_DIR = path.join(process.cwd(), "data", "notebook");

function notebookPath(courseId: string): string {
  return path.join(NOTEBOOK_DIR, `${courseId}.json`);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(NOTEBOOK_DIR, { recursive: true });
}

async function atomicWrite(filePath: string, data: unknown): Promise<void> {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

export async function readCourseNotebook(
  courseId: string
): Promise<CourseNotebook> {
  await ensureDir();
  const filePath = notebookPath(courseId);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<CourseNotebook>;
    return {
      lessons:
        parsed.lessons && typeof parsed.lessons === "object"
          ? parsed.lessons
          : {},
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { lessons: {}, updatedAt: new Date(0).toISOString() };
    }
    throw err;
  }
}

export async function readLessonNotebook(
  courseId: string,
  lessonId: string
): Promise<{ content: string; updatedAt: string | null }> {
  const notebook = await readCourseNotebook(courseId);
  const entry = notebook.lessons[lessonId];
  return {
    content: entry?.content ?? "",
    updatedAt: entry?.updatedAt ?? null,
  };
}

export async function saveLessonNotebook(args: {
  courseId: string;
  lessonId: string;
  content: string;
}): Promise<{ content: string; updatedAt: string }> {
  await ensureDir();
  const notebook = await readCourseNotebook(args.courseId);
  const updatedAt = new Date().toISOString();
  const next: CourseNotebook = {
    lessons: {
      ...notebook.lessons,
      [args.lessonId]: { content: args.content, updatedAt },
    },
    updatedAt,
  };
  await atomicWrite(notebookPath(args.courseId), next);
  return { content: args.content, updatedAt };
}
