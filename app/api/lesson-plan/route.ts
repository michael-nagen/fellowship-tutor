import { NextResponse } from "next/server";
import { readLessonPlan } from "@/lib/lesson-plan";
import { getLesson, loadCourse } from "@/lib/syllabus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");
  const lessonId = searchParams.get("lessonId");

  if (!courseId || !lessonId) {
    return NextResponse.json(
      { error: "Missing courseId or lessonId" },
      { status: 400 }
    );
  }

  const course = await loadCourse(courseId);
  const lesson = getLesson(course, lessonId);
  const plan = await readLessonPlan(courseId, lesson);

  return NextResponse.json(
    {
      ...plan,
      outcomes: lesson.outcomes,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
