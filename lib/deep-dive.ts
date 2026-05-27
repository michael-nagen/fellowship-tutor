import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";

export type DeepDiveMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type DeepDiveEntry = {
  id: string;
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  topicIndex: number;
  topicLabel: string;
  messages: DeepDiveMessage[];
  createdAt: string;
  updatedAt: string;
};

export type DeepDiveStore = {
  entries: DeepDiveEntry[];
  updatedAt: string;
};

const DEEP_DIVE_DIR = path.join(process.cwd(), "data", "deep-dive");

function storePath(courseId: string): string {
  return path.join(DEEP_DIVE_DIR, `${courseId}.json`);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(DEEP_DIVE_DIR, { recursive: true });
}

async function atomicWrite(filePath: string, data: unknown): Promise<void> {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

export async function readDeepDiveStore(courseId: string): Promise<DeepDiveStore> {
  await ensureDir();
  const filePath = storePath(courseId);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<DeepDiveStore>;
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { entries: [], updatedAt: new Date(0).toISOString() };
    }
    throw err;
  }
}

export async function getDeepDiveEntry(
  courseId: string,
  entryId: string
): Promise<DeepDiveEntry | null> {
  const store = await readDeepDiveStore(courseId);
  return store.entries.find((e) => e.id === entryId) ?? null;
}

export async function findDeepDiveEntry(args: {
  courseId: string;
  lessonId: string;
  topicIndex: number;
}): Promise<DeepDiveEntry | null> {
  const store = await readDeepDiveStore(args.courseId);
  return (
    store.entries.find(
      (e) =>
        e.lessonId === args.lessonId && e.topicIndex === args.topicIndex
    ) ?? null
  );
}

export async function createDeepDiveEntry(args: {
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  topicIndex: number;
  topicLabel: string;
}): Promise<DeepDiveEntry> {
  const store = await readDeepDiveStore(args.courseId);
  const existing = store.entries.find(
    (e) =>
      e.lessonId === args.lessonId && e.topicIndex === args.topicIndex
  );
  if (existing) return existing;

  const now = new Date().toISOString();
  const entry: DeepDiveEntry = {
    id: nanoid(),
    courseId: args.courseId,
    lessonId: args.lessonId,
    lessonTitle: args.lessonTitle,
    topicIndex: args.topicIndex,
    topicLabel: args.topicLabel,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  const next: DeepDiveStore = {
    entries: [entry, ...store.entries],
    updatedAt: now,
  };
  await atomicWrite(storePath(args.courseId), next);
  return entry;
}

export async function saveDeepDiveMessages(args: {
  courseId: string;
  entryId: string;
  messages: DeepDiveMessage[];
}): Promise<DeepDiveEntry> {
  const store = await readDeepDiveStore(args.courseId);
  const index = store.entries.findIndex((e) => e.id === args.entryId);
  if (index === -1) {
    throw new Error(`Deep dive entry "${args.entryId}" not found.`);
  }

  const updatedAt = new Date().toISOString();
  const entry: DeepDiveEntry = {
    ...store.entries[index],
    messages: args.messages,
    updatedAt,
  };

  const entries = [...store.entries];
  entries[index] = entry;

  await atomicWrite(storePath(args.courseId), {
    entries,
    updatedAt,
  });

  return entry;
}
