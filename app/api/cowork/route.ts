import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { buildCoworkPrompt } from "@/lib/cowork-prompt";
import type { CoworkMessage, CoworkMode } from "@/lib/cowork-types";
import {
  getCoworkThread,
  readCoworkStore,
  saveCoworkMessages,
} from "@/lib/cowork";
import { getLesson, loadCourse } from "@/lib/syllabus";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type CoworkRequestBody = {
  messages: UIMessage[];
  courseId: string;
  lessonId: string;
  mode: CoworkMode;
};

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");
  if (!courseId) {
    return NextResponse.json({ error: "Missing courseId" }, { status: 400 });
  }
  const store = await readCoworkStore(courseId);
  return NextResponse.json(store, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(req: Request): Promise<Response> {
  const body = (await req.json()) as {
    courseId?: string;
    mode?: CoworkMode;
    messages?: CoworkMessage[];
  };

  if (!body.courseId || !body.mode || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const thread = await saveCoworkMessages({
    courseId: body.courseId,
    mode: body.mode,
    messages: body.messages,
  });

  return NextResponse.json(thread);
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as CoworkRequestBody;
  const { messages, courseId, lessonId, mode } = body;

  if (!courseId || !lessonId || (mode !== "friend" && mode !== "study-buddy")) {
    return new Response("Missing courseId, lessonId, or mode", { status: 400 });
  }

  const course = await loadCourse(courseId);
  const lesson = getLesson(course, lessonId);
  const system = await buildCoworkPrompt({ mode, course, lesson });

  const result = streamText({
    model: openai("gpt-5.5"),
    system,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
