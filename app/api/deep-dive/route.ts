import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import {
  createDeepDiveEntry,
  getDeepDiveEntry,
  readDeepDiveStore,
  saveDeepDiveMessages,
  type DeepDiveMessage,
} from "@/lib/deep-dive";
import { buildDeepDivePrompt } from "@/lib/deep-dive-prompt";
import { getLesson, loadCourse } from "@/lib/syllabus";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type DeepDiveRequestBody = {
  messages: UIMessage[];
  courseId: string;
  lessonId: string;
  topicIndex: number;
  entryId?: string;
};

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");
  const entryId = searchParams.get("entryId");
  const lessonId = searchParams.get("lessonId");
  const topicIndexStr = searchParams.get("topicIndex");

  if (!courseId) {
    return NextResponse.json({ error: "Missing courseId" }, { status: 400 });
  }

  if (entryId) {
    const entry = await getDeepDiveEntry(courseId, entryId);
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }
    return NextResponse.json(entry, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (lessonId && topicIndexStr !== null) {
    const topicIndex = Number(topicIndexStr);
    const course = await loadCourse(courseId);
    const lesson = getLesson(course, lessonId);
    const topicLabel = lesson.outcomes[topicIndex];
    if (!topicLabel) {
      return NextResponse.json({ error: "Invalid topic" }, { status: 400 });
    }
    const entry = await createDeepDiveEntry({
      courseId,
      lessonId,
      lessonTitle: lesson.title,
      topicIndex,
      topicLabel,
    });
    return NextResponse.json(entry, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const store = await readDeepDiveStore(courseId);
  return NextResponse.json(store, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(req: Request): Promise<Response> {
  const body = (await req.json()) as {
    courseId?: string;
    entryId?: string;
    messages?: DeepDiveMessage[];
  };

  if (!body.courseId || !body.entryId || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const entry = await saveDeepDiveMessages({
    courseId: body.courseId,
    entryId: body.entryId,
    messages: body.messages,
  });

  return NextResponse.json(entry);
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as DeepDiveRequestBody;
  const { messages, courseId, lessonId, topicIndex } = body;

  if (!courseId || !lessonId || topicIndex === undefined) {
    return new Response("Missing courseId, lessonId, or topicIndex", {
      status: 400,
    });
  }

  const course = await loadCourse(courseId);
  const lesson = getLesson(course, lessonId);
  const topicLabel = lesson.outcomes[topicIndex];
  if (!topicLabel) {
    return new Response("Invalid topicIndex", { status: 400 });
  }

  await createDeepDiveEntry({
    courseId,
    lessonId,
    lessonTitle: lesson.title,
    topicIndex,
    topicLabel,
  });

  const system = await buildDeepDivePrompt({ course, lesson, topicLabel });

  const result = streamText({
    model: openai("gpt-5.5"),
    system,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
