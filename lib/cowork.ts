import { promises as fs } from "node:fs";
import path from "node:path";
import type { CoworkMessage, CoworkMode, CoworkStore, CoworkThread } from "./cowork-types";

const COWORK_DIR = path.join(process.cwd(), "data", "cowork");

function storePath(courseId: string): string {
  return path.join(COWORK_DIR, `${courseId}.json`);
}

function emptyThread(): CoworkThread {
  return { messages: [], updatedAt: new Date(0).toISOString() };
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(COWORK_DIR, { recursive: true });
}

async function atomicWrite(filePath: string, data: unknown): Promise<void> {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

function threadKey(mode: CoworkMode): "friend" | "studyBuddy" {
  return mode === "friend" ? "friend" : "studyBuddy";
}

export async function readCoworkStore(courseId: string): Promise<CoworkStore> {
  await ensureDir();
  try {
    const raw = await fs.readFile(storePath(courseId), "utf8");
    const parsed = JSON.parse(raw) as Partial<CoworkStore>;
    return {
      courseId,
      friend: parsed.friend ?? emptyThread(),
      studyBuddy: parsed.studyBuddy ?? emptyThread(),
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        courseId,
        friend: emptyThread(),
        studyBuddy: emptyThread(),
        updatedAt: new Date(0).toISOString(),
      };
    }
    throw err;
  }
}

export async function saveCoworkMessages(args: {
  courseId: string;
  mode: CoworkMode;
  messages: CoworkMessage[];
}): Promise<CoworkThread> {
  const store = await readCoworkStore(args.courseId);
  const key = threadKey(args.mode);
  const updatedAt = new Date().toISOString();
  const thread: CoworkThread = {
    messages: args.messages,
    updatedAt,
  };
  const next: CoworkStore = {
    ...store,
    [key]: thread,
    updatedAt,
  };
  await atomicWrite(storePath(args.courseId), next);
  return thread;
}

export function getCoworkThread(
  store: CoworkStore,
  mode: CoworkMode
): CoworkThread {
  return mode === "friend" ? store.friend : store.studyBuddy;
}
