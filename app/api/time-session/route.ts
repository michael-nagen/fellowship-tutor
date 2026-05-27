import { NextResponse } from "next/server";
import { readLearningMode } from "@/lib/learning-mode";
import { loadCourse } from "@/lib/syllabus";
import {
  buildTimeSessionPlan,
  endTimeSession,
  extendTimeSession,
  pauseTimeSession,
  readTimeSession,
  resumeTimeSession,
  startTimeSession,
  isSessionStale,
} from "@/lib/time-session";
import {
  describeSessionCapacity,
  formatBudgetLabel,
  getEffectiveRemainingMinutes,
  groupSessionTopics,
} from "@/lib/time-session-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");
  if (!courseId) {
    return NextResponse.json({ error: "Missing courseId" }, { status: 400 });
  }

  const previewMinutes = searchParams.get("previewMinutes");
  if (previewMinutes) {
    const budgetMinutes = Number(previewMinutes);
    if (!Number.isFinite(budgetMinutes) || budgetMinutes <= 0) {
      return NextResponse.json({ error: "Invalid previewMinutes" }, { status: 400 });
    }
    const course = await loadCourse(courseId);
    const plan = await buildTimeSessionPlan({ course, courseId, budgetMinutes });
    const capacity = describeSessionCapacity(budgetMinutes);
    const lessonGroups = groupSessionTopics(plan.plannedTopics);
    return NextResponse.json(
      {
        budgetMinutes,
        budgetLabel: formatBudgetLabel(budgetMinutes),
        capacity,
        lessonGroups,
        ...plan,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const session = await readTimeSession(courseId);
  if (!session) {
    return NextResponse.json({ session: null, remainingMinutes: null });
  }

  const course = await loadCourse(courseId);
  let activeSession = session;
  if (isSessionStale(activeSession, course)) {
    const settings = await readLearningMode(courseId);
    activeSession = await startTimeSession({
      course,
      courseId,
      budgetMinutes:
        activeSession.budgetMinutes ?? settings.timeBudgetMinutes ?? 30,
    });
  }

  const remainingMinutes = getEffectiveRemainingMinutes({
    budgetMinutes: activeSession.budgetMinutes,
    startedAt: activeSession.startedAt,
    accumulatedPauseMs: activeSession.accumulatedPauseMs,
    pausedAt: activeSession.pausedAt,
    status: activeSession.status,
  });

  return NextResponse.json(
    { session: activeSession, remainingMinutes },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function PUT(req: Request): Promise<Response> {
  const body = (await req.json()) as {
    courseId?: string;
    action?: "pause" | "resume" | "extend" | "end" | "restart";
    breakMinutes?: number;
    extraMinutes?: number;
    summary?: string;
    budgetMinutes?: number;
  };

  if (!body.courseId || !body.action) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const course = await loadCourse(body.courseId);

  let session = await readTimeSession(body.courseId);

  switch (body.action) {
    case "restart":
      session = await startTimeSession({
        course,
        courseId: body.courseId,
        budgetMinutes: body.budgetMinutes ?? session?.budgetMinutes ?? 30,
      });
      break;
    case "pause":
      session = await pauseTimeSession(body.courseId, body.breakMinutes);
      break;
    case "resume":
      session = await resumeTimeSession({
        courseId: body.courseId,
        breakMinutes: body.breakMinutes,
      });
      break;
    case "extend":
      session = await extendTimeSession({
        course,
        courseId: body.courseId,
        extraMinutes: body.extraMinutes ?? 15,
      });
      break;
    case "end":
      session = await endTimeSession({
        courseId: body.courseId,
        summary: body.summary ?? "Session ended.",
      });
      break;
  }

  if (!session) {
    return NextResponse.json({ error: "No session" }, { status: 404 });
  }

  const remainingMinutes = getEffectiveRemainingMinutes({
    budgetMinutes: session.budgetMinutes,
    startedAt: session.startedAt,
    accumulatedPauseMs: session.accumulatedPauseMs,
    pausedAt: session.pausedAt,
    status: session.status,
  });

  return NextResponse.json({ session, remainingMinutes });
}
