"use client";

import { BookOpen, Clock, LayoutList } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  MIN_TIME_MINUTES,
  TIME_PRESETS,
  type LearningMode,
  type LearningModeSettings,
} from "@/lib/learning-mode-types";

type LearningModePickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: LearningModeSettings;
  courseId: string;
  onSave: (mode: LearningMode, timeBudgetMinutes?: number) => Promise<void>;
};

type SessionPreview = {
  budgetLabel: string;
  capacity: { topicCount: number; label: string };
  lessonGroups: { lessonId: string; lessonTitle: string; topics: { label: string }[] }[];
};

export function LearningModePicker({
  open,
  onOpenChange,
  settings,
  courseId,
  onSave,
}: LearningModePickerProps) {
  const [pick, setPick] = useState<LearningMode>(settings.mode);
  const [minutes, setMinutes] = useState(
    settings.timeBudgetMinutes ?? 30
  );
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<SessionPreview | null>(null);

  useEffect(() => {
    if (pick !== "time" || !open) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    fetch(
      `/api/time-session?courseId=${encodeURIComponent(courseId)}&previewMinutes=${minutes}`,
      { cache: "no-store" }
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setPreview(data as SessionPreview);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pick, minutes, courseId, open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(pick, pick === "time" ? minutes : undefined);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>How would you like to work?</DialogTitle>
          <DialogDescription>
            Choose lesson-based or time-based learning. Your progress stays
            synced — switch anytime and pick up where you left off.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 p-5">
          <button
            type="button"
            onClick={() => setPick("lessons")}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors",
              pick === "lessons"
                ? "border-brand bg-brand/5 ring-1 ring-brand/25"
                : "border-border hover:bg-muted/50"
            )}
          >
            <LayoutList
              className={cn(
                "mt-0.5 size-5 shrink-0",
                pick === "lessons" ? "text-brand" : "text-muted-foreground"
              )}
            />
            <div>
              <p className="text-sm font-medium">By lessons</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Complete one lesson at a time with full mastery checkpoints.
                Best when you want structure end-to-end.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setPick("time")}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors",
              pick === "time"
                ? "border-brand bg-brand/5 ring-1 ring-brand/25"
                : "border-border hover:bg-muted/50"
            )}
          >
            <Clock
              className={cn(
                "mt-0.5 size-5 shrink-0",
                pick === "time" ? "text-brand" : "text-muted-foreground"
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">By time</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Set how long you have. You&apos;ll get a full curriculum for
                that session — every subject topic planned for your clock,
                across as many lessons as fit.
              </p>
            </div>
          </button>

          {pick === "time" && (
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-xs font-medium text-muted-foreground">
                Session length (min {MIN_TIME_MINUTES} min)
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {TIME_PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    size="sm"
                    variant={minutes === preset ? "default" : "outline"}
                    onClick={() => setMinutes(preset)}
                    className="h-8 min-w-[3.5rem] rounded-lg"
                  >
                    {preset}m
                  </Button>
                ))}
              </div>
              <label className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                Custom
                <input
                  type="number"
                  min={MIN_TIME_MINUTES}
                  max={240}
                  step={5}
                  value={minutes}
                  onChange={(e) =>
                    setMinutes(
                      Math.max(MIN_TIME_MINUTES, Number(e.target.value) || MIN_TIME_MINUTES)
                    )
                  }
                  className="h-8 w-20 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
                />
                minutes
              </label>
              {preview && preview.capacity.topicCount > 0 && (
                <div className="mt-4 space-y-2 border-t border-border/60 pt-4">
                  <p className="text-xs font-medium text-foreground">
                    {preview.budgetLabel} session plan
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {preview.capacity.label} across{" "}
                    {preview.lessonGroups.length} lesson
                    {preview.lessonGroups.length === 1 ? "" : "s"}
                  </p>
                  <ul className="max-h-36 space-y-2 overflow-y-auto text-[11px]">
                    {preview.lessonGroups.map((group) => (
                      <li key={group.lessonId}>
                        <p className="font-medium text-foreground">
                          {group.lessonTitle}
                        </p>
                        <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
                          {group.topics.map((t, i) => (
                            <li key={i}>· {t.label}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Start working"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type LearningModeBadgeProps = {
  settings: LearningModeSettings;
  timeRemainingMinutes: number | null;
  onOpenPicker: () => void;
};

export function LearningModeBadge({
  settings,
  timeRemainingMinutes,
  onOpenPicker,
}: LearningModeBadgeProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onOpenPicker}
      className="h-auto w-full justify-start gap-2 rounded-xl px-3 py-2.5 text-left"
    >
      {settings.mode === "time" ? (
        <Clock className="size-4 shrink-0 text-brand" />
      ) : (
        <BookOpen className="size-4 shrink-0 text-brand" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium">
          {settings.mode === "time" ? "Time mode" : "Lesson mode"}
        </span>
        <span className="block truncate text-[10px] text-muted-foreground">
          {settings.mode === "time" && timeRemainingMinutes !== null
            ? `${timeRemainingMinutes} min left · tap to change`
            : "Tap to change how you work"}
        </span>
      </span>
    </Button>
  );
}
