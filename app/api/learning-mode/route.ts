import { NextResponse } from "next/server";
import { loadCourse } from "@/lib/syllabus";
import {
  MIN_TIME_MINUTES,
  readLearningMode,
  saveLearningMode,
  type LearningMode,
} from "@/lib/learning-mode";
import { readTimeSession, startTimeSession } from "@/lib/time-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");
  if (!courseId) {
    return NextResponse.json({ error: "Missing courseId" }, { status: 400 });
  }
  const settings = await readLearningMode(courseId);
  return NextResponse.json(settings, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(req: Request): Promise<Response> {
  const body = (await req.json()) as {
    courseId?: string;
    mode?: LearningMode;
    timeBudgetMinutes?: number;
  };

  if (!body.courseId || (body.mode !== "lessons" && body.mode !== "time")) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (
    body.mode === "time" &&
    body.timeBudgetMinutes !== undefined &&
    body.timeBudgetMinutes < MIN_TIME_MINUTES
  ) {
    return NextResponse.json(
      { error: `Minimum session length is ${MIN_TIME_MINUTES} minutes.` },
      { status: 400 }
    );
  }

  const previous = await readLearningMode(body.courseId);
  const settings = await saveLearningMode({
    courseId: body.courseId,
    mode: body.mode,
    timeBudgetMinutes: body.timeBudgetMinutes,
  });

  if (body.mode === "time") {
    const newBudget = settings.timeBudgetMinutes ?? MIN_TIME_MINUTES;
    const existing = await readTimeSession(body.courseId);
    const shouldStart =
      previous.mode !== "time" ||
      !existing ||
      existing.status === "ended" ||
      (body.timeBudgetMinutes !== undefined &&
        existing.budgetMinutes !== newBudget);

    if (shouldStart) {
      const course = await loadCourse(body.courseId);
      await startTimeSession({
        course,
        courseId: body.courseId,
        budgetMinutes: newBudget,
      });
    }
  }

  return NextResponse.json(settings);
}
