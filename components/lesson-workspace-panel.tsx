"use client";

import { Check, Circle, Sparkles, Telescope } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DeepDivePanel,
  type DeepDiveTarget,
} from "@/components/deep-dive-panel";
import { NotebookPanel } from "@/components/course-notebook";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { TopicStatus } from "@/lib/lesson-plan";
import type { LearningModeSettings } from "@/lib/learning-mode-types";
import {
  formatBudgetLabel,
  groupSessionTopics,
  topicKey,
  type SessionTopic,
  type TimeSessionRecord,
} from "@/lib/time-session-types";
import type { Course, Lesson } from "@/lib/syllabus";

type LessonPlanData = {
  topics: TopicStatus[];
  outcomes: string[];
  updatedAt: string;
};

type LessonWorkspacePanelProps = {
  course: Course;
  lesson: Lesson;
  planRefreshKey: number;
  notebookOpen: boolean;
  onNotebookClose: () => void;
  deepDiveTarget: DeepDiveTarget | null;
  onOpenDeepDive: (target: DeepDiveTarget) => void;
  onCloseDeepDive: () => void;
  learningMode?: LearningModeSettings;
  timeSession?: TimeSessionRecord | null;
  timeRemainingMinutes?: number | null;
};

export function LessonWorkspacePanel({
  course,
  lesson,
  planRefreshKey,
  notebookOpen,
  onNotebookClose,
  deepDiveTarget,
  onOpenDeepDive,
  onCloseDeepDive,
  learningMode,
  timeSession,
  timeRemainingMinutes,
}: LessonWorkspacePanelProps) {
  const [plan, setPlan] = useState<LessonPlanData | null>(null);

  const loadPlan = useCallback(async () => {
    const res = await fetch(
      `/api/lesson-plan?courseId=${encodeURIComponent(course.id)}&lessonId=${encodeURIComponent(lesson.id)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return;
    setPlan((await res.json()) as LessonPlanData);
  }, [course.id, lesson.id]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan, planRefreshKey]);

  const outcomes = plan?.outcomes ?? lesson.outcomes;
  const isTimeMode =
    learningMode?.mode === "time" &&
    timeSession &&
    timeSession.status !== "ended";
  const sessionLessonGroups = isTimeMode
    ? groupSessionTopics(timeSession.plannedTopics)
    : [];

  const deepDiveLesson = useMemo(() => {
    if (!deepDiveTarget) return lesson;
    return (
      course.lessons.find((l) => l.id === deepDiveTarget.lessonId) ?? lesson
    );
  }, [course.lessons, deepDiveTarget, lesson]);

  return (
    <aside
      className={cn(
        "glass-panel relative flex h-full shrink-0 flex-col border-l border-border/70 shadow-sm transition-[width] duration-200",
        deepDiveTarget ? "w-96" : "w-72"
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col px-4 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/90">
          {isTimeMode ? "Session plan" : "Lesson plan"}
        </p>
        <h3 className="mt-1 truncate text-sm font-medium leading-tight">
          {isTimeMode
            ? `${formatBudgetLabel(timeSession.budgetMinutes)} session`
            : lesson.title}
        </h3>
        {isTimeMode && timeRemainingMinutes !== null && (
          <p className="mt-1 text-[10px] font-medium text-brand">
            {timeSession.status === "paused"
              ? "Paused"
              : `${timeRemainingMinutes} min remaining`}
            {" · "}
            {timeSession.coveredKeys.length}/{timeSession.plannedTopics.length}{" "}
            topics
            {" · "}
            {sessionLessonGroups.length} lesson
            {sessionLessonGroups.length === 1 ? "" : "s"}
          </p>
        )}

        <ScrollArea className="mt-3 min-h-0 flex-1">
          {isTimeMode ? (
            <SessionPlanList
              session={timeSession}
              onOpenDeepDive={onOpenDeepDive}
            />
          ) : (
            <LessonPlanList
              lesson={lesson}
              outcomes={outcomes}
              plan={plan}
              onOpenDeepDive={onOpenDeepDive}
            />
          )}
        </ScrollArea>
      </div>

      {notebookOpen && !deepDiveTarget && (
        <div className="absolute inset-0 z-10 flex flex-col border-l border-amber-900/15 bg-[#faf3df] shadow-xl animate-in fade-in slide-in-from-right-2 duration-200">
          <NotebookPanel
            course={course}
            lesson={lesson}
            onClose={onNotebookClose}
          />
        </div>
      )}

      {deepDiveTarget && (
        <div className="absolute inset-0 z-20 flex flex-col border-l border-brand/15 deep-dive-shell shadow-xl animate-in fade-in slide-in-from-right-2 duration-200">
          <DeepDivePanel
            course={course}
            lesson={deepDiveLesson}
            target={deepDiveTarget}
            onClose={onCloseDeepDive}
            onSelectHistory={onOpenDeepDive}
          />
        </div>
      )}
    </aside>
  );
}

function SessionPlanList({
  session,
  onOpenDeepDive,
}: {
  session: TimeSessionRecord;
  onOpenDeepDive: (target: DeepDiveTarget) => void;
}) {
  const covered = new Set(session.coveredKeys);
  const groups = groupSessionTopics(session.plannedTopics);

  return (
    <div className="space-y-4 pr-2">
      {groups.map((group) => (
        <SessionSection
          key={group.lessonId}
          title={group.lessonTitle}
          topics={group.topics}
          covered={covered}
          hideLessonTitle
          onOpenDeepDive={onOpenDeepDive}
        />
      ))}
      {session.bonusTopics.length > 0 && (
        <SessionSection
          title="✦ Bonus"
          topics={session.bonusTopics}
          covered={covered}
          muted
          bonus
          onOpenDeepDive={onOpenDeepDive}
        />
      )}
    </div>
  );
}

function SessionSection({
  title,
  topics,
  covered,
  muted,
  bonus,
  hideLessonTitle,
  onOpenDeepDive,
}: {
  title: string;
  topics: SessionTopic[];
  covered: Set<string>;
  muted?: boolean;
  bonus?: boolean;
  hideLessonTitle?: boolean;
  onOpenDeepDive: (target: DeepDiveTarget) => void;
}) {
  return (
    <div>
      <p
        className={cn(
          "mb-1.5 text-[10px] font-semibold uppercase tracking-wider",
          muted ? "text-muted-foreground/70" : "text-muted-foreground"
        )}
      >
        {title}
      </p>
      <ol className="space-y-0.5">
        {topics.map((t) => {
          const key = topicKey(t.lessonId, t.topicIndex);
          const done = covered.has(key);
          return (
            <li
              key={key}
              className={cn(
                "rounded-lg px-2 py-2 transition-colors",
                !done && !bonus && "bg-brand/8 ring-1 ring-brand/10",
                bonus && !done && "border border-dashed border-brand/25 bg-brand-soft/60"
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                    done
                      ? "border-success/30 bg-success/10 text-success"
                      : bonus
                        ? "border-brand/30 bg-brand-soft text-brand"
                        : "border-brand/40 bg-brand/10"
                  )}
                >
                  {done ? (
                    <Check className="size-2.5" strokeWidth={3} />
                  ) : bonus ? (
                    <Sparkles className="size-2.5 text-brand" />
                  ) : (
                    <Circle className="size-2 fill-brand text-brand" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  {!hideLessonTitle && (
                    <p className="text-[10px] text-muted-foreground">
                      {t.lessonTitle}
                    </p>
                  )}
                  <span
                    className={cn(
                      "text-xs leading-snug",
                      done &&
                        "text-muted-foreground line-through decoration-muted-foreground/35",
                      !done && !bonus && "font-medium text-foreground",
                      bonus && !done && "text-brand/90"
                    )}
                  >
                    {t.label}
                  </span>
                </div>
              </div>
              {done && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onOpenDeepDive({
                      lessonId: t.lessonId,
                      lessonTitle: t.lessonTitle,
                      topicIndex: t.topicIndex,
                      topicLabel: t.label,
                    })
                  }
                  className="mt-1 ml-6 h-6 gap-1 px-1.5 text-[10px] text-brand hover:bg-brand/10 hover:text-brand"
                >
                  <Telescope className="size-3" />
                  Deep dive
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function LessonPlanList({
  lesson,
  outcomes,
  plan,
  onOpenDeepDive,
}: {
  lesson: Lesson;
  outcomes: string[];
  plan: LessonPlanData | null;
  onOpenDeepDive: (target: DeepDiveTarget) => void;
}) {
  return (
    <ol className="space-y-0.5 pr-2">
      {outcomes.map((outcome, index) => {
        const status =
          plan?.topics[index] ?? (index === 0 ? "current" : "pending");
        const done = status === "completed";
        const current = status === "current";

        return (
          <li
            key={index}
            className={cn(
              "rounded-md px-1.5 py-1.5",
              current && !done && "bg-brand/6"
            )}
          >
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                  done
                    ? "border-success/30 bg-success/10 text-success"
                    : current
                      ? "border-brand/40 bg-brand/10"
                      : "border-muted-foreground/25"
                )}
              >
                {done ? (
                  <Check className="size-2.5" strokeWidth={3} />
                ) : current ? (
                  <Circle className="size-2 fill-brand text-brand" />
                ) : null}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 text-xs leading-snug",
                  done &&
                    "text-muted-foreground line-through decoration-muted-foreground/35",
                  current && !done && "font-medium text-foreground",
                  !done && !current && "text-muted-foreground"
                )}
              >
                {outcome}
              </span>
            </div>
            {done && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  onOpenDeepDive({
                    lessonId: lesson.id,
                    lessonTitle: lesson.title,
                    topicIndex: index,
                    topicLabel: outcome,
                  })
                }
                className="mt-1 ml-6 h-6 gap-1 px-1.5 text-[10px] text-indigo-700 hover:bg-indigo-500/10 hover:text-indigo-800"
              >
                <Telescope className="size-3" />
                Deep dive
              </Button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
