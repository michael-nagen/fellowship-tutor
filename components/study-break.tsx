"use client";

import { Coffee, ExternalLink, Lightbulb, Play, Video } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BREAK_PRESETS,
  ensureNotificationPermission,
  formatBreakCountdown,
  getBreakRemainingSeconds,
  notifyBreakEnded,
  readStoredBreak,
  writeStoredBreak,
  type StudyBreakRecord,
} from "@/lib/break-timer";
import { getBreakSuggestions } from "@/lib/break-activities";
import { cn } from "@/lib/utils";

type StudyBreakControlsProps = {
  onStartBreak: (minutes: number) => void;
  breakActive: boolean;
  className?: string;
  variant?: "header" | "rail";
};

export function StudyBreakControls({
  onStartBreak,
  breakActive,
  className,
  variant = "header",
}: StudyBreakControlsProps) {
  const [open, setOpen] = useState(false);

  const handlePick = (minutes: number) => {
    void ensureNotificationPermission();
    onStartBreak(minutes);
    setOpen(false);
  };

  const trigger =
    variant === "rail" ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={breakActive}
        title="Take a break — timer + stretch ideas"
        className={cn(
          "group relative flex w-full flex-col items-center gap-1.5 rounded-2xl border px-1 py-3 transition-all duration-200",
          breakActive
            ? "border-brand/30 bg-brand/10 opacity-60"
            : "border-transparent bg-brand/8 hover:border-brand/25 hover:bg-brand/12"
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-brand text-white shadow-inner transition-transform group-hover:scale-105">
          <Coffee className="size-5" strokeWidth={2.2} />
        </span>
        <span className="max-w-full px-0.5 text-center text-[9px] font-semibold leading-tight text-foreground/90">
          Break
        </span>
      </button>
    ) : (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={breakActive}
        className={cn(
          "gap-1.5 rounded-full border-brand/25 bg-brand-soft/40 text-brand hover:bg-brand-soft/70",
          className
        )}
      >
        <Coffee className="size-3.5" />
        <span className="hidden sm:inline">Break</span>
      </Button>
    );

  return (
    <>
      {trigger}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm gap-0 p-0">
          <DialogHeader className="border-b border-border/60 px-5 py-4">
            <DialogTitle>Take a break</DialogTitle>
            <DialogDescription>
              Step away and recharge. We&apos;ll suggest a short stretch video
              and tips while the timer runs.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 p-5">
            {BREAK_PRESETS.map((m) => (
              <Button
                key={m}
                type="button"
                variant="outline"
                className="h-14 flex-col gap-1 rounded-xl border-brand/20 bg-brand-soft/30 hover:bg-brand-soft/60"
                onClick={() => handlePick(m)}
              >
                <span className="text-lg font-semibold text-brand">{m}</span>
                <span className="text-[10px] text-muted-foreground">minutes</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

type StudyBreakOverlayProps = {
  record: StudyBreakRecord;
  remainingSeconds: number;
  expired: boolean;
  onEndBreak: () => void;
};

export function StudyBreakOverlay({
  record,
  remainingSeconds,
  expired,
  onEndBreak,
}: StudyBreakOverlayProps) {
  const progress =
    record.durationMinutes > 0
      ? 1 - remainingSeconds / (record.durationMinutes * 60)
      : 1;
  const suggestions = getBreakSuggestions(record.durationMinutes);

  return (
    <div className="study-break-overlay absolute inset-0 z-40 flex items-center justify-center overflow-y-auto p-4 sm:p-6">
      <div
        className={cn(
          "warm-card tutor-pop-in my-auto w-full max-w-md rounded-3xl p-6 text-center sm:p-8",
          expired && "ring-2 ring-brand/40"
        )}
      >
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand-soft/80">
          <Coffee className={cn("size-8 text-brand", expired && "animate-bounce")} />
        </div>

        {expired ? (
          <>
            <h3 className="text-xl font-semibold tracking-tight text-brand">
              Break time is up!
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Hope you feel refreshed. Ready to pick up where you left off?
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              On a break
            </p>
            <p className="mt-3 font-mono text-5xl font-semibold tabular-nums tracking-tight text-brand">
              {formatBreakCountdown(remainingSeconds)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {record.durationMinutes}-minute break — stretch, hydrate, breathe.
            </p>

            <div className="mt-5 space-y-2 text-left">
              <p className="text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                While you wait
              </p>
              {suggestions.map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-border/70 bg-background/60 p-3"
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                        item.kind === "youtube"
                          ? "bg-red-500/12 text-red-600"
                          : "bg-brand/10 text-brand"
                      )}
                    >
                      {item.kind === "youtube" ? (
                        <Video className="size-4" />
                      ) : (
                        <Lightbulb className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {item.detail}
                      </p>
                      {item.href && (
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                        >
                          Open on YouTube
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand transition-all duration-1000 ease-linear"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>

        <Button
          type="button"
          size="lg"
          onClick={onEndBreak}
          className={cn(
            "mt-6 w-full gap-2 rounded-xl",
            expired && "animate-pulse"
          )}
        >
          <Play className="size-4" />
          {expired ? "Back to studying" : "End break early"}
        </Button>
      </div>
    </div>
  );
}

export function useStudyBreakTimer(args: {
  courseId: string;
  onBreakStart?: (minutes: number) => Promise<void>;
  onBreakEnd?: () => Promise<void>;
}) {
  const [record, setRecord] = useState<StudyBreakRecord | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [expired, setExpired] = useState(false);
  const [notified, setNotified] = useState(false);

  useEffect(() => {
    const stored = readStoredBreak(args.courseId);
    if (stored) {
      setRecord(stored);
      const rem = getBreakRemainingSeconds(stored);
      setRemainingSeconds(rem);
      setExpired(rem <= 0);
    }
  }, [args.courseId]);

  useEffect(() => {
    if (!record) return;
    const tick = () => {
      const rem = getBreakRemainingSeconds(record);
      setRemainingSeconds(rem);
      if (rem <= 0) {
        setExpired(true);
        if (!notified) {
          setNotified(true);
          notifyBreakEnded();
        }
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [record, notified]);

  const startBreak = useCallback(
    async (minutes: number) => {
      const next: StudyBreakRecord = {
        courseId: args.courseId,
        startedAt: new Date().toISOString(),
        durationMinutes: minutes,
      };
      writeStoredBreak(next);
      setRecord(next);
      setRemainingSeconds(minutes * 60);
      setExpired(false);
      setNotified(false);
      await args.onBreakStart?.(minutes);
    },
    [args]
  );

  const endBreak = useCallback(async () => {
    writeStoredBreak(null);
    setRecord(null);
    setRemainingSeconds(0);
    setExpired(false);
    setNotified(false);
    await args.onBreakEnd?.();
  }, [args]);

  return {
    breakActive: record !== null,
    record,
    remainingSeconds,
    expired,
    startBreak,
    endBreak,
  };
}
