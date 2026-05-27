"use client";

import { Coffee, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  formatStudyMinutes,
  type StudyTimeStats,
} from "@/lib/study-time-types";
import { cn } from "@/lib/utils";

const HEARTBEAT_MS = 30_000;
const SNOOZE_MS = 15 * 60_000;

function snoozeKey(courseId: string): string {
  return `study-break-snooze-${courseId}`;
}

async function fetchStats(courseId: string): Promise<StudyTimeStats | null> {
  const res = await fetch(
    `/api/study-time?courseId=${encodeURIComponent(courseId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  return (await res.json()) as StudyTimeStats;
}

async function sendHeartbeat(
  courseId: string,
  deltaMs: number
): Promise<StudyTimeStats | null> {
  const res = await fetch("/api/study-time", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseId, action: "heartbeat", deltaMs }),
  });
  if (!res.ok) return null;
  return (await res.json()) as StudyTimeStats;
}

export async function recordStudyBreakApi(
  courseId: string,
  durationMinutes: number
): Promise<StudyTimeStats | null> {
  const res = await fetch("/api/study-time", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      courseId,
      action: "break",
      durationMinutes,
    }),
  });
  if (!res.ok) return null;
  return (await res.json()) as StudyTimeStats;
}

export function useStudyTimeTracker(args: {
  courseId: string;
  breakActive: boolean;
  enabled?: boolean;
}) {
  const { courseId, breakActive, enabled = true } = args;
  const [stats, setStats] = useState<StudyTimeStats | null>(null);
  const [snoozedUntil, setSnoozedUntil] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const raw = sessionStorage.getItem(snoozeKey(courseId));
    return raw ? Number(raw) : 0;
  });
  const lastTickRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!enabled) return;
    void fetchStats(courseId).then(setStats);
  }, [courseId, enabled]);

  useEffect(() => {
    if (!enabled || breakActive) return;

    lastTickRef.current = Date.now();

    const tick = () => {
      if (document.visibilityState !== "visible") {
        lastTickRef.current = Date.now();
        return;
      }
      const now = Date.now();
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;
      if (delta < 5_000) return;
      void sendHeartbeat(courseId, delta).then((next) => {
        if (next) setStats(next);
      });
    };

    const id = setInterval(tick, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [courseId, breakActive, enabled]);

  const dismissSuggestion = useCallback(() => {
    const until = Date.now() + SNOOZE_MS;
    sessionStorage.setItem(snoozeKey(courseId), String(until));
    setSnoozedUntil(until);
  }, [courseId]);

  const refreshStats = useCallback(async () => {
    const next = await fetchStats(courseId);
    if (next) setStats(next);
    return next;
  }, [courseId]);

  const showProactiveBreak =
    enabled &&
    !breakActive &&
    stats !== null &&
    stats.currentStreakMinutes >= stats.suggestBreakAfterMinutes &&
    Date.now() > snoozedUntil;

  return {
    stats,
    showProactiveBreak,
    dismissSuggestion,
    refreshStats,
  };
}

type ProactiveBreakBannerProps = {
  stats: StudyTimeStats;
  onTakeBreak: () => void;
  onDismiss: () => void;
  className?: string;
};

export function ProactiveBreakBanner({
  stats,
  onTakeBreak,
  onDismiss,
  className,
}: ProactiveBreakBannerProps) {
  const typical =
    stats.typicalBreakMinutes !== null
      ? ` — you usually break around ${formatStudyMinutes(stats.typicalBreakMinutes)}`
      : "";

  return (
    <div
      className={cn(
        "tutor-pop-in flex items-center gap-3 border-b border-brand/20 bg-gradient-to-r from-brand/10 via-brand-soft/50 to-transparent px-4 py-2.5",
        className
      )}
    >
      <Coffee className="size-4 shrink-0 text-brand" />
      <p className="min-w-0 flex-1 text-sm text-foreground/90">
        You&apos;ve been studying for{" "}
        <span className="font-medium">
          {formatStudyMinutes(stats.currentStreakMinutes)}
        </span>
        {typical}. A short break can help you retain more.
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0 rounded-full border-brand/30 bg-background/80 text-brand hover:bg-brand-soft/60"
        onClick={onTakeBreak}
      >
        Take a break
      </Button>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Dismiss break suggestion"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
