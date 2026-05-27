"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LearningModePicker,
} from "@/components/learning-mode-picker";
import { LessonChat } from "@/components/lesson-chat";
import { LessonWorkspacePanel } from "@/components/lesson-workspace-panel";
import { CoworkRail } from "@/components/cowork-rail";
import { Sidebar } from "@/components/sidebar";
import {
  StudyBreakOverlay,
  useStudyBreakTimer,
} from "@/components/study-break";
import type { DeepDiveTarget } from "@/components/deep-dive-panel";
import {
  type LearningModeSettings,
} from "@/lib/learning-mode-types";
import {
  getEffectiveRemainingMinutes,
  topicKey,
  type TimeSessionRecord,
} from "@/lib/time-session-types";
import type { Progress } from "@/lib/progress";
import type { Course, CourseSummary } from "@/lib/syllabus";

type TutorShellProps = {
  availableCourses: CourseSummary[];
  course: Course;
  initialProgress: Progress;
};

function firstIncompleteLessonId(course: Course, progress: Progress): string {
  const completed = new Set(progress.completedLessonIds);
  const next = course.lessons.find((l) => !completed.has(l.id));
  return next?.id ?? course.lessons[course.lessons.length - 1]?.id ?? "";
}

const DEFAULT_MODE: LearningModeSettings = {
  mode: "lessons",
  updatedAt: new Date(0).toISOString(),
};

export function TutorShell({
  availableCourses,
  course,
  initialProgress,
}: TutorShellProps) {
  return (
    <TutorShellInner
      key={course.id}
      availableCourses={availableCourses}
      course={course}
      initialProgress={initialProgress}
    />
  );
}

function TutorShellInner({
  availableCourses,
  course,
  initialProgress,
}: TutorShellProps) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress>(initialProgress);
  const [activeLessonId, setActiveLessonId] = useState<string>(() =>
    firstIncompleteLessonId(course, initialProgress)
  );
  const [planRefreshKey, setPlanRefreshKey] = useState(0);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [deepDiveTarget, setDeepDiveTarget] = useState<DeepDiveTarget | null>(
    null
  );
  const [learningMode, setLearningMode] =
    useState<LearningModeSettings>(DEFAULT_MODE);
  const [timeSession, setTimeSession] = useState<TimeSessionRecord | null>(
    null
  );
  const [timeRemainingMinutes, setTimeRemainingMinutes] = useState<
    number | null
  >(null);
  const [modePickerOpen, setModePickerOpen] = useState(false);

  const loadLearningMode = useCallback(async () => {
    const res = await fetch(
      `/api/learning-mode?courseId=${encodeURIComponent(course.id)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return;
    setLearningMode((await res.json()) as LearningModeSettings);
  }, [course.id]);

  const loadTimeSession = useCallback(async (): Promise<TimeSessionRecord | null> => {
    const res = await fetch(
      `/api/time-session?courseId=${encodeURIComponent(course.id)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      session: TimeSessionRecord | null;
      remainingMinutes: number | null;
    };
    setTimeSession(data.session);
    setTimeRemainingMinutes(data.remainingMinutes);
    return data.session;
  }, [course.id]);

  const anchorToSession = useCallback((session: TimeSessionRecord) => {
    const next = session.plannedTopics.find(
      (t) => !session.coveredKeys.includes(topicKey(t.lessonId, t.topicIndex))
    );
    if (next) setActiveLessonId(next.lessonId);
  }, []);

  useEffect(() => {
    loadLearningMode();
    loadTimeSession();
  }, [loadLearningMode, loadTimeSession]);

  useEffect(() => {
    if (learningMode.mode !== "time" || !timeSession) {
      setTimeRemainingMinutes(null);
      return;
    }
    const tick = () =>
      setTimeRemainingMinutes(
        getEffectiveRemainingMinutes({
          budgetMinutes: timeSession.budgetMinutes,
          startedAt: timeSession.startedAt,
          accumulatedPauseMs: timeSession.accumulatedPauseMs,
          pausedAt: timeSession.pausedAt,
          status: timeSession.status,
        })
      );
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [learningMode.mode, timeSession]);

  const timeSessionAction = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch("/api/time-session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: course.id, ...body }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        session: TimeSessionRecord;
        remainingMinutes: number;
      };
      setTimeSession(data.session);
      setTimeRemainingMinutes(data.remainingMinutes);
      setPlanRefreshKey((k) => k + 1);
    },
    [course.id]
  );

  const handlePauseSession = useCallback(
    (breakMinutes: number) =>
      timeSessionAction({
        action: "pause",
        breakMinutes: breakMinutes > 0 ? breakMinutes : undefined,
      }),
    [timeSessionAction]
  );

  const handleResumeSession = useCallback(
    () => timeSessionAction({ action: "resume" }),
    [timeSessionAction]
  );

  const handleExtendSession = useCallback(
    (extraMinutes: number) =>
      timeSessionAction({ action: "extend", extraMinutes }),
    [timeSessionAction]
  );

  const handleEndSession = useCallback(
    () =>
      timeSessionAction({
        action: "end",
        summary: "Saved progress — learner chose to return later.",
      }),
    [timeSessionAction]
  );

  const onBreakStart = useCallback(
    async (minutes: number) => {
      if (learningMode.mode === "time" && timeSession?.status === "active") {
        await handlePauseSession(minutes);
      }
    },
    [learningMode.mode, timeSession?.status, handlePauseSession]
  );

  const onBreakEnd = useCallback(async () => {
    if (learningMode.mode === "time" && timeSession?.status === "paused") {
      await handleResumeSession();
    }
  }, [learningMode.mode, timeSession?.status, handleResumeSession]);

  const studyBreak = useStudyBreakTimer({
    courseId: course.id,
    onBreakStart,
    onBreakEnd,
  });

  const breakRestoreRef = useRef(false);
  useEffect(() => {
    if (
      breakRestoreRef.current ||
      !studyBreak.record ||
      studyBreak.expired ||
      learningMode.mode !== "time" ||
      timeSession?.status !== "active"
    ) {
      return;
    }
    breakRestoreRef.current = true;
    void handlePauseSession(studyBreak.record.durationMinutes);
  }, [
    studyBreak.record,
    studyBreak.expired,
    learningMode.mode,
    timeSession?.status,
    handlePauseSession,
  ]);

  const saveLearningMode = useCallback(
    async (mode: "lessons" | "time", timeBudgetMinutes?: number) => {
      const res = await fetch("/api/learning-mode", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: course.id,
          mode,
          timeBudgetMinutes,
        }),
      });
      if (!res.ok) return;
      setLearningMode((await res.json()) as LearningModeSettings);
      const session = await loadTimeSession();
      if (mode === "time" && session) anchorToSession(session);
    },
    [course.id, loadTimeSession, anchorToSession]
  );

  const refreshProgress = useCallback(async (): Promise<Progress> => {
    const res = await fetch(
      `/api/progress?courseId=${encodeURIComponent(course.id)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return progress;
    const next = (await res.json()) as Progress;
    setProgress(next);
    return next;
  }, [course.id, progress]);

  const handleLessonCompleted = useCallback(
    async (completedLessonId: string) => {
      const updated = await refreshProgress();
      const currentIndex = course.lessons.findIndex(
        (l) => l.id === completedLessonId
      );
      const next = course.lessons[currentIndex + 1];
      if (
        next &&
        !updated.completedLessonIds.includes(next.id) &&
        activeLessonId === completedLessonId
      ) {
        return next.id;
      }
      return null;
    },
    [activeLessonId, course.lessons, refreshProgress]
  );

  const goToLesson = useCallback((lessonId: string) => {
    setActiveLessonId(lessonId);
  }, []);

  const handleCourseSelect = useCallback(
    (courseId: string) => {
      if (courseId === course.id) return;
      router.push(`/?courseId=${encodeURIComponent(courseId)}`);
    },
    [course.id, router]
  );

  const bumpLessonPlan = useCallback(() => {
    setPlanRefreshKey((k) => k + 1);
    loadTimeSession();
  }, [loadTimeSession]);

  const toggleNotebook = useCallback(() => {
    setNotebookOpen((open) => !open);
  }, []);

  const closeNotebook = useCallback(() => {
    setNotebookOpen(false);
  }, []);

  const openDeepDive = useCallback((target: DeepDiveTarget) => {
    setNotebookOpen(false);
    setDeepDiveTarget(target);
  }, []);

  const closeDeepDive = useCallback(() => {
    setDeepDiveTarget(null);
  }, []);

  const activeLesson = useMemo(
    () =>
      course.lessons.find((l) => l.id === activeLessonId) ?? course.lessons[0],
    [activeLessonId, course.lessons]
  );

  const chatKey = `${activeLesson.id}-${learningMode.mode}-${learningMode.updatedAt}-${timeSession?.sessionId ?? "none"}`;

  return (
    <div className="flex h-svh overflow-hidden">
      <Sidebar
        availableCourses={availableCourses}
        course={course}
        progress={progress}
        activeLessonId={activeLesson.id}
        learningMode={learningMode}
        timeRemainingMinutes={timeRemainingMinutes}
        onOpenModePicker={() => setModePickerOpen(true)}
        onSelectCourse={handleCourseSelect}
        onSelectLesson={goToLesson}
      />
      <main className="tutor-backdrop relative flex min-w-0 flex-1 flex-col">
        <LessonChat
          key={chatKey}
          course={course}
          lesson={activeLesson}
          learningMode={learningMode}
          timeSession={timeSession}
        timeRemainingMinutes={timeRemainingMinutes}
        onPauseSession={handlePauseSession}
        onResumeSession={handleResumeSession}
        onExtendSession={handleExtendSession}
        onEndSession={handleEndSession}
        breakActive={studyBreak.breakActive}
        studyBreakRecord={studyBreak.record}
          studyBreakRemainingSeconds={studyBreak.remainingSeconds}
          studyBreakExpired={studyBreak.expired}
          onEndBreak={studyBreak.endBreak}
          isAlreadyCompleted={progress.completedLessonIds.includes(
            activeLesson.id
          )}
          onLessonCompleted={handleLessonCompleted}
          onAdvance={goToLesson}
          onLessonPlanUpdated={bumpLessonPlan}
          notebookOpen={notebookOpen}
          onToggleNotebook={toggleNotebook}
        />
      </main>
      <LessonWorkspacePanel
        course={course}
        lesson={activeLesson}
        planRefreshKey={planRefreshKey}
        notebookOpen={notebookOpen}
        onNotebookClose={closeNotebook}
        deepDiveTarget={deepDiveTarget}
        onOpenDeepDive={openDeepDive}
        onCloseDeepDive={closeDeepDive}
        learningMode={learningMode}
        timeSession={timeSession}
        timeRemainingMinutes={timeRemainingMinutes}
      />
      <CoworkRail
        course={course}
        lesson={activeLesson}
        onStartBreak={studyBreak.startBreak}
        breakActive={studyBreak.breakActive}
      />
      <LearningModePicker
        key={`${learningMode.mode}-${learningMode.timeBudgetMinutes}`}
        open={modePickerOpen}
        onOpenChange={setModePickerOpen}
        settings={learningMode}
        courseId={course.id}
        onSave={saveLearningMode}
      />
    </div>
  );
}
