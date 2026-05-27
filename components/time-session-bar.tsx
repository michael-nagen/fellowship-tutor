"use client";

import { Coffee, Pause, Play, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BREAK_PRESETS,
  EXTEND_PRESETS,
  type TimeSessionRecord,
} from "@/lib/time-session-types";

type TimeSessionBarProps = {
  session: TimeSessionRecord;
  remainingMinutes: number;
  onPause: (breakMinutes: number) => Promise<void>;
  onResume: () => Promise<void>;
  onExtend: (extraMinutes: number) => Promise<void>;
  onEnd: () => Promise<void>;
};

export function TimeSessionBar({
  session,
  remainingMinutes,
  onPause,
  onResume,
  onExtend,
  onEnd,
}: TimeSessionBarProps) {
  const isPaused = session.status === "paused";
  const timeUp = remainingMinutes <= 0 && !isPaused;
  const lowTime = remainingMinutes > 0 && remainingMinutes <= 5;

  if (!isPaused && !timeUp && !lowTime) return null;

  return (
    <div className="border-b border-brand/15 bg-brand-soft/50 px-6 py-3">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {isPaused
              ? "Session paused"
              : timeUp
                ? "Session time is up"
                : `${remainingMinutes} minutes left`}
          </p>
          <p className="text-xs text-muted-foreground">
            {isPaused
              ? "Take your break — resume when you're ready."
              : timeUp
                ? "Choose a break, extend, or save progress for next time."
                : "Wrap up the current topic or choose an option below."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isPaused ? (
            <Button size="sm" onClick={() => onResume()} className="gap-1.5">
              <Play className="size-3.5" />
              Resume
            </Button>
          ) : (
            <>
              {BREAK_PRESETS.map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant="outline"
                  onClick={() => onPause(m)}
                  className="gap-1.5"
                >
                  <Coffee className="size-3.5" />
                  {m}m break
                </Button>
              ))}
              {EXTEND_PRESETS.map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant="outline"
                  onClick={() => onExtend(m)}
                  className="gap-1.5"
                >
                  <Plus className="size-3.5" />
                  +{m}m
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onPause(0)}
                className="gap-1.5"
              >
                <Pause className="size-3.5" />
                Pause
              </Button>
            </>
          )}
          {(timeUp || isPaused) && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onEnd()}
              className="gap-1.5"
            >
              <Save className="size-3.5" />
              Save & return
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
