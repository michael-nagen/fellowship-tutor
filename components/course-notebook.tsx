"use client";

import { NotebookPen, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { InputGroupButton } from "@/components/ui/input-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Course, Lesson } from "@/lib/syllabus";

type NotebookToggleButtonProps = {
  active: boolean;
  hasNotes: boolean;
  onClick: () => void;
};

export function NotebookToggleButton({
  active,
  hasNotes,
  onClick,
}: NotebookToggleButtonProps) {
  return (
    <TooltipProvider delay={300}>
      <Tooltip>
        <TooltipTrigger
          render={
            <InputGroupButton
              type="button"
              size="icon-sm"
              variant={active ? "default" : "outline"}
              onClick={onClick}
              aria-label={active ? "Close notebook" : "Open notebook"}
              aria-pressed={active}
              className={cn(
                "relative shrink-0",
                active && "bg-brand hover:bg-brand/90",
                hasNotes && !active && "border-brand/45"
              )}
            >
              <NotebookPen className="size-4" />
              {hasNotes && !active && (
                <span className="absolute top-1 right-1 size-1.5 rounded-full bg-brand ring-2 ring-card" />
              )}
            </InputGroupButton>
          }
        />
        <TooltipContent side="top">
          {active
            ? "Close notebook"
            : "Open notebook — tutor reads this at lesson end"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

type NotebookPanelProps = {
  course: Course;
  lesson: Lesson;
  onClose: () => void;
};

export function NotebookPanel({ course, lesson, onClose }: NotebookPanelProps) {
  const [notebook, setNotebook] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle"
  );
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef("");

  const loadNotebook = useCallback(async () => {
    const res = await fetch(
      `/api/notebook?courseId=${encodeURIComponent(course.id)}&lessonId=${encodeURIComponent(lesson.id)}`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const data = (await res.json()) as { content: string };
      setNotebook(data.content);
      lastSavedRef.current = data.content;
    } else {
      setNotebook("");
      lastSavedRef.current = "";
    }
  }, [course.id, lesson.id]);

  useEffect(() => {
    loadNotebook();
  }, [loadNotebook]);

  useEffect(() => {
    if (notebook === lastSavedRef.current) return;

    setSaveState("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      const res = await fetch("/api/notebook", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: course.id,
          lessonId: lesson.id,
          content: notebook,
        }),
      });
      if (res.ok) {
        lastSavedRef.current = notebook;
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
      } else {
        setSaveState("idle");
      }
    }, 600);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [notebook, course.id, lesson.id]);

  return (
    <div className="notebook-side flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-amber-900/10 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-900/50">
            Notebook
          </p>
          <p className="truncate text-xs font-medium text-amber-950">
            {lesson.title}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-amber-900/55">
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : "Auto-save"}
          </span>
          <InputGroupButton
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={onClose}
            aria-label="Close notebook"
            className="text-amber-900/60 hover:bg-amber-900/8 hover:text-amber-950"
          >
            <X className="size-3.5" />
          </InputGroupButton>
        </div>
      </div>

      <div className="notebook-side-body relative min-h-0 flex-1 p-3">
        <div className="notebook-lines notebook-lines-side relative h-full min-h-0 rounded-lg">
          <div
            className="notebook-margin absolute inset-y-0 left-0 w-6 border-r border-red-400/30"
            aria-hidden
          />
          <Textarea
            value={notebook}
            onChange={(e) => setNotebook(e.target.value)}
            placeholder="Summaries, insights, aha moments…"
            className="notebook-textarea h-full min-h-0 resize-none border-0 bg-transparent pl-8 pr-1 font-serif text-[13px] leading-7 text-amber-950 shadow-none ring-0 placeholder:text-amber-900/35 focus-visible:ring-0"
          />
        </div>
      </div>
    </div>
  );
}

export function useNotebookHasNotes(courseId: string, lessonId: string): boolean {
  const [hasNotes, setHasNotes] = useState(false);

  useEffect(() => {
    fetch(
      `/api/notebook?courseId=${encodeURIComponent(courseId)}&lessonId=${encodeURIComponent(lessonId)}`,
      { cache: "no-store" }
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { content?: string } | null) => {
        setHasNotes((data?.content?.trim().length ?? 0) > 0);
      })
      .catch(() => setHasNotes(false));
  }, [courseId, lessonId]);

  return hasNotes;
}
