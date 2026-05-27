import { NextResponse } from "next/server";
import {
  readCourseNotebook,
  readLessonNotebook,
  saveLessonNotebook,
} from "@/lib/notebook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");
  const lessonId = searchParams.get("lessonId");

  if (!courseId) {
    return NextResponse.json({ error: "Missing courseId" }, { status: 400 });
  }

  if (lessonId) {
    const entry = await readLessonNotebook(courseId, lessonId);
    return NextResponse.json(entry, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const notebook = await readCourseNotebook(courseId);
  return NextResponse.json(notebook, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(req: Request): Promise<Response> {
  const body = (await req.json()) as {
    courseId?: string;
    lessonId?: string;
    content?: string;
  };

  if (!body.courseId || !body.lessonId || typeof body.content !== "string") {
    return NextResponse.json(
      { error: "Missing courseId, lessonId, or content" },
      { status: 400 }
    );
  }

  const saved = await saveLessonNotebook({
    courseId: body.courseId,
    lessonId: body.lessonId,
    content: body.content,
  });

  return NextResponse.json(saved);
}
