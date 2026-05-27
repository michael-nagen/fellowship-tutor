import { promises as fs } from "node:fs";
import path from "node:path";
import type { Lesson } from "./syllabus";

export type TopicStatus = "pending" | "current" | "completed";

export type LessonPlan = {
  topics: TopicStatus[];
  updatedAt: string;
};

const PLAN_DIR = path.join(process.cwd(), "data", "lesson-plan");

function planPath(courseId: string, lessonId: string): string {
  return path.join(PLAN_DIR, courseId, `${lessonId}.json`);
}

async function ensureDir(courseId: string): Promise<void> {
  await fs.mkdir(path.join(PLAN_DIR, courseId), { recursive: true });
}

async function atomicWrite(filePath: string, data: unknown): Promise<void> {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

export function defaultLessonPlan(lesson: Lesson): LessonPlan {
  const topics = lesson.outcomes.map((_, index) =>
    index === 0 ? ("current" as const) : ("pending" as const)
  );
  return {
    topics: topics.length > 0 ? topics : [],
    updatedAt: new Date(0).toISOString(),
  };
}

export async function readLessonPlan(
  courseId: string,
  lesson: Lesson
): Promise<LessonPlan> {
  await ensureDir(courseId);
  const filePath = planPath(courseId, lesson.id);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LessonPlan>;
    if (!Array.isArray(parsed.topics)) {
      return defaultLessonPlan(lesson);
    }
    const topics = lesson.outcomes.map((_, index) => {
      const status = parsed.topics?.[index];
      if (
        status === "pending" ||
        status === "current" ||
        status === "completed"
      ) {
        return status;
      }
      return index === 0 ? ("current" as const) : ("pending" as const);
    });
    return {
      topics,
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultLessonPlan(lesson);
    }
    throw err;
  }
}

export async function markTopicComplete(args: {
  courseId: string;
  lesson: Lesson;
  topicIndex: number;
}): Promise<LessonPlan> {
  const { courseId, lesson, topicIndex } = args;
  if (topicIndex < 0 || topicIndex >= lesson.outcomes.length) {
    throw new Error(
      `Topic index ${topicIndex} is out of range for lesson "${lesson.id}".`
    );
  }

  const current = await readLessonPlan(courseId, lesson);
  const topics = lesson.outcomes.map((_, i) => {
    if (i <= topicIndex) return "completed" as const;
    if (i === topicIndex + 1) return "current" as const;
    const existing = current.topics[i];
    if (existing === "completed") return "completed" as const;
    return "pending" as const;
  });

  const next: LessonPlan = {
    topics,
    updatedAt: new Date().toISOString(),
  };

  await ensureDir(courseId);
  await atomicWrite(planPath(courseId, lesson.id), next);
  return next;
}

export async function markAllTopicsComplete(args: {
  courseId: string;
  lesson: Lesson;
}): Promise<LessonPlan> {
  const { courseId, lesson } = args;
  const next: LessonPlan = {
    topics: lesson.outcomes.map(() => "completed" as const),
    updatedAt: new Date().toISOString(),
  };
  await ensureDir(courseId);
  await atomicWrite(planPath(courseId, lesson.id), next);
  return next;
}

export function countPlanProgress(plan: LessonPlan): {
  completed: number;
  total: number;
  remaining: number;
} {
  const total = plan.topics.length;
  const completed = plan.topics.filter((t) => t === "completed").length;
  return { completed, total, remaining: total - completed };
}
