import { promises as fs } from "node:fs";
import path from "node:path";
import {
  MIN_TIME_MINUTES,
  type LearningMode,
  type LearningModeSettings,
} from "./learning-mode-types";

export {
  MIN_TIME_MINUTES,
  TIME_PRESETS,
  getTimeRemainingMinutes,
  type LearningMode,
  type LearningModeSettings,
} from "./learning-mode-types";

const LEARNER_DIR = path.join(process.cwd(), "data", "learner");

function settingsPath(courseId: string): string {
  return path.join(LEARNER_DIR, `learning-mode-${courseId}.json`);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(LEARNER_DIR, { recursive: true });
}

export async function readLearningMode(
  courseId: string
): Promise<LearningModeSettings> {
  await ensureDir();
  try {
    const raw = await fs.readFile(settingsPath(courseId), "utf8");
    const parsed = JSON.parse(raw) as Partial<LearningModeSettings>;
    const mode = parsed.mode === "time" ? "time" : "lessons";
    return {
      mode,
      timeBudgetMinutes:
        typeof parsed.timeBudgetMinutes === "number"
          ? Math.max(MIN_TIME_MINUTES, parsed.timeBudgetMinutes)
          : undefined,
      sessionStartedAt: parsed.sessionStartedAt,
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        mode: "lessons",
        updatedAt: new Date(0).toISOString(),
      };
    }
    throw err;
  }
}

export async function saveLearningMode(args: {
  courseId: string;
  mode: LearningMode;
  timeBudgetMinutes?: number;
}): Promise<LearningModeSettings> {
  await ensureDir();
  const now = new Date().toISOString();
  const current = await readLearningMode(args.courseId);

  let next: LearningModeSettings;

  if (args.mode === "time") {
    const minutes = Math.max(
      MIN_TIME_MINUTES,
      args.timeBudgetMinutes ?? MIN_TIME_MINUTES
    );
    const budgetChanged =
      current.mode !== "time" || current.timeBudgetMinutes !== minutes;
    next = {
      mode: "time",
      timeBudgetMinutes: minutes,
      sessionStartedAt: budgetChanged ? now : (current.sessionStartedAt ?? now),
      updatedAt: now,
    };
  } else {
    next = {
      mode: "lessons",
      timeBudgetMinutes: current.timeBudgetMinutes,
      sessionStartedAt: current.sessionStartedAt,
      updatedAt: now,
    };
  }

  const filePath = settingsPath(args.courseId);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
  return next;
}
