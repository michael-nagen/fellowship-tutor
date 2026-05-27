import { NextResponse } from "next/server";
import {
  getStudyTimeStats,
  recordStudyBreak,
  recordStudyHeartbeat,
} from "@/lib/study-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");
  if (!courseId) {
    return NextResponse.json({ error: "Missing courseId" }, { status: 400 });
  }
  const stats = await getStudyTimeStats(courseId);
  return NextResponse.json(stats, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PUT(req: Request): Promise<Response> {
  const body = (await req.json()) as {
    courseId?: string;
    action?: "heartbeat" | "break";
    deltaMs?: number;
    durationMinutes?: number;
  };

  if (!body.courseId || !body.action) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (body.action === "heartbeat") {
    const stats = await recordStudyHeartbeat({
      courseId: body.courseId,
      deltaMs: body.deltaMs ?? 0,
    });
    return NextResponse.json(stats);
  }

  if (body.action === "break") {
    const stats = await recordStudyBreak({
      courseId: body.courseId,
      durationMinutes: body.durationMinutes ?? 5,
    });
    return NextResponse.json(stats);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
