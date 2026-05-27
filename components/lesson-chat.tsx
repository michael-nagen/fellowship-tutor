"use client";

import {
  DefaultChatTransport,
  type ToolUIPart,
  type UIMessage,
} from "ai";
import { useChat } from "@ai-sdk/react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import {
  NotebookToggleButton,
  useNotebookHasNotes,
} from "@/components/course-notebook";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Button } from "@/components/ui/button";
import { TimeSessionBar } from "@/components/time-session-bar";
import type { StudyBreakRecord } from "@/lib/break-timer";
import {
  StudyBreakOverlay,
} from "@/components/study-break";
import { cn } from "@/lib/utils";
import type { LearningModeSettings } from "@/lib/learning-mode-types";
import {
  formatBudgetLabel,
  groupSessionTopics,
  type TimeSessionRecord,
} from "@/lib/time-session-types";
import type { Course, Lesson } from "@/lib/syllabus";

type CompleteLessonOutput = {
  ok: boolean;
  lessonId?: string;
  lessonTitle?: string;
  courseId?: string;
  reason?: string;
  error?: string;
};

function findCompletionPart(messages: UIMessage[]): {
  output: CompleteLessonOutput;
  toolCallId: string;
} | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    for (const part of msg.parts) {
      const toolPart = part as ToolUIPart;
      if (
        toolPart.type === "tool-complete_lesson" &&
        toolPart.state === "output-available"
      ) {
        const output = toolPart.output as CompleteLessonOutput;
        if (output?.ok) {
          return { output, toolCallId: toolPart.toolCallId };
        }
      }
    }
  }
  return null;
}

type LessonChatProps = {
  course: Course;
  lesson: Lesson;
  isAlreadyCompleted: boolean;
  onLessonCompleted: (lessonId: string) => Promise<string | null>;
  onAdvance: (lessonId: string) => void;
  onLessonPlanUpdated?: () => void;
  notebookOpen: boolean;
  onToggleNotebook: () => void;
  learningMode?: LearningModeSettings;
  timeSession?: TimeSessionRecord | null;
  timeRemainingMinutes?: number | null;
  onPauseSession?: (breakMinutes: number) => Promise<void>;
  onResumeSession?: () => Promise<void>;
  onExtendSession?: (extraMinutes: number) => Promise<void>;
  onEndSession?: () => Promise<void>;
  breakActive?: boolean;
  studyBreakRecord?: StudyBreakRecord | null;
  studyBreakRemainingSeconds?: number;
  studyBreakExpired?: boolean;
  onEndBreak?: () => Promise<void>;
};

export function LessonChat({
  course,
  lesson,
  isAlreadyCompleted,
  onLessonCompleted,
  onAdvance,
  onLessonPlanUpdated,
  notebookOpen,
  onToggleNotebook,
  learningMode,
  timeSession,
  timeRemainingMinutes,
  onPauseSession,
  onResumeSession,
  onExtendSession,
  onEndSession,
  breakActive = false,
  studyBreakRecord,
  studyBreakRemainingSeconds = 0,
  studyBreakExpired = false,
  onEndBreak,
}: LessonChatProps) {
  const [input, setInput] = useState("");
  const [nextLessonId, setNextLessonId] = useState<string | null>(null);
  const handledCompletionRef = useRef<string | null>(null);
  const handledPlanUpdatesRef = useRef<Set<string>>(new Set());
  const hasNotes = useNotebookHasNotes(course.id, lesson.id);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { courseId: course.id, lessonId: lesson.id },
      }),
    [course.id, lesson.id]
  );

  const { messages, sendMessage, status, error, stop } = useChat({
    transport,
  });

  const completion = findCompletionPart(messages);
  const isComplete = isAlreadyCompleted || completion !== null;
  const isStreaming = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (!completion) return;
    const key = completion.toolCallId;
    if (handledCompletionRef.current === key) return;
    handledCompletionRef.current = key;
    onLessonPlanUpdated?.();
    onLessonCompleted(lesson.id).then((next) => {
      setNextLessonId(next);
    });
  }, [completion, lesson.id, onLessonCompleted, onLessonPlanUpdated]);

  useEffect(() => {
    if (!onLessonPlanUpdated) return;
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        const toolPart = part as ToolUIPart;
        if (
          toolPart.type === "tool-mark_topic_complete" &&
          toolPart.state === "output-available"
        ) {
          const output = toolPart.output as { ok?: boolean };
          if (!output?.ok) continue;
          const key = toolPart.toolCallId;
          if (handledPlanUpdatesRef.current.has(key)) continue;
          handledPlanUpdatesRef.current.add(key);
          onLessonPlanUpdated();
        }
        if (
          (toolPart.type === "tool-extend_time_session" ||
            toolPart.type === "tool-end_time_session" ||
            toolPart.type === "tool-start_break") &&
          toolPart.state === "output-available"
        ) {
          const key = toolPart.toolCallId;
          if (handledPlanUpdatesRef.current.has(key)) continue;
          handledPlanUpdatesRef.current.add(key);
          onLessonPlanUpdated();
        }
      }
    }
  }, [messages, onLessonPlanUpdated]);

  const handleSubmit = useCallback(
    (msg: PromptInputMessage) => {
      const text = msg.text.trim();
      if (!text || isStreaming || isComplete) return;
      sendMessage({ text });
      setInput("");
    },
    [isComplete, isStreaming, sendMessage]
  );

  const handleSuggestion = useCallback(
    (suggestion: string) => {
      if (isStreaming || isComplete) return;
      sendMessage({ text: suggestion });
    },
    [isComplete, isStreaming, sendMessage]
  );

  const emptyStateSuggestions = useMemo(
    () => buildSuggestions(lesson),
    [lesson]
  );

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      <LessonHeader
        course={course}
        lesson={lesson}
        learningMode={learningMode}
        timeSession={timeSession}
        timeRemainingMinutes={timeRemainingMinutes}
      />

      {studyBreakRecord && onEndBreak && (
        <StudyBreakOverlay
          record={studyBreakRecord}
          remainingSeconds={studyBreakRemainingSeconds}
          expired={studyBreakExpired}
          onEndBreak={() => void onEndBreak()}
        />
      )}

      {learningMode?.mode === "time" &&
        timeSession &&
        timeSession.status !== "ended" &&
        timeRemainingMinutes !== null &&
        onPauseSession &&
        onResumeSession &&
        onExtendSession &&
        onEndSession && (
          <TimeSessionBar
            session={timeSession}
            remainingMinutes={timeRemainingMinutes ?? 0}
            onPause={onPauseSession}
            onResume={onResumeSession}
            onExtend={onExtendSession}
            onEnd={onEndSession}
          />
        )}

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-6 py-8">
          {messages.length === 0 ? (
            <EmptyState
              lesson={lesson}
              suggestions={emptyStateSuggestions}
              onPick={handleSuggestion}
            />
          ) : (
            messages.map((message) => (
              <MessageView key={message.id} message={message} />
            ))
          )}

          {completion && (
            <CompletionCard
              output={completion.output}
              nextLesson={
                nextLessonId
                  ? course.lessons.find((l) => l.id === nextLessonId) ?? null
                  : null
              }
              onAdvance={onAdvance}
            />
          )}

          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Something went wrong. {error.message}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="relative border-t border-border/70 bg-card/60 backdrop-blur-md supports-[backdrop-filter]:bg-card/50">
        {isStreaming && (
          <div className="tutor-stream-bar absolute inset-x-0 top-0 h-px" />
        )}
        <div className="mx-auto w-full max-w-3xl px-6 py-4">
          {isComplete ? (
            <LockedInputNotice
              course={course}
              lesson={lesson}
              notebookOpen={notebookOpen}
              onToggleNotebook={onToggleNotebook}
              nextLesson={
                nextLessonId
                  ? course.lessons.find((l) => l.id === nextLessonId) ?? null
                  : null
              }
              onAdvance={onAdvance}
              alreadyCompletedBeforeChat={isAlreadyCompleted && !completion}
            />
          ) : (
            <PromptInput
              onSubmit={handleSubmit}
              className="rounded-2xl border border-border/80 bg-card/90 shadow-sm backdrop-blur-sm focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/15"
            >
              <PromptInputTextarea
                value={input}
                onChange={(e) => setInput(e.currentTarget.value)}
                placeholder={
                  breakActive
                    ? "On a break — come back when the timer ends…"
                    : `Talk through "${lesson.title}" with your tutor…`
                }
                disabled={isComplete || breakActive}
              />
              <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-0.5">
                <p className="min-w-0 truncate text-[11px] text-muted-foreground">
                  <kbd className="font-mono">Enter</kbd> send ·{" "}
                  <kbd className="font-mono">Shift+Enter</kbd> newline
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  <NotebookToggleButton
                    active={notebookOpen}
                    hasNotes={hasNotes}
                    onClick={onToggleNotebook}
                  />
                  <PromptInputSubmit
                    status={status}
                    onStop={stop}
                    disabled={breakActive || (!input.trim() && !isStreaming)}
                  />
                </div>
              </div>
            </PromptInput>
          )}
        </div>
      </div>
    </div>
  );
}

function LessonHeader({
  course,
  lesson,
  learningMode,
  timeSession,
  timeRemainingMinutes,
}: {
  course: Course;
  lesson: Lesson;
  learningMode?: LearningModeSettings;
  timeSession?: TimeSessionRecord | null;
  timeRemainingMinutes?: number | null;
}) {
  const showTimer =
    learningMode?.mode === "time" &&
    timeSession &&
    timeSession.status !== "ended" &&
    timeRemainingMinutes !== null &&
    timeRemainingMinutes !== undefined;

  const sessionLessons = timeSession
    ? groupSessionTopics(timeSession.plannedTopics)
    : [];

  return (
    <header className="border-b border-border/70 bg-card/50 px-6 py-4 backdrop-blur-md supports-[backdrop-filter]:bg-card/40">
      <div className="mx-auto flex w-full max-w-3xl items-start justify-between gap-3">
        <div className="min-w-0 flex flex-1 flex-col gap-1">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <BookOpen className="size-3.5" />
            <span className="uppercase tracking-wider">{course.title}</span>
          </div>
          {showTimer && timeSession ? (
            <>
              <h2 className="text-xl font-semibold tracking-tight">
                {formatBudgetLabel(timeSession.budgetMinutes)} study session
              </h2>
              <p className="text-xs text-muted-foreground">
                {timeSession.plannedTopics.length} topics ·{" "}
                {sessionLessons.map((g) => g.lessonTitle).join(" · ")}
              </p>
              <p className="text-[11px] text-muted-foreground/80">
                Now in: {lesson.title}
              </p>
            </>
          ) : (
            <h2 className="text-xl font-semibold tracking-tight">{lesson.title}</h2>
          )}
        </div>
        {showTimer && (
          <div
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              timeSession?.status === "paused"
                ? "bg-muted text-muted-foreground"
                : timeRemainingMinutes <= 5
                  ? "bg-brand/15 text-brand"
                  : "bg-brand/10 text-brand"
            )}
          >
            <Clock className="size-3.5" />
            {timeSession?.status === "paused"
              ? "Paused"
              : `${timeRemainingMinutes}m left`}
          </div>
        )}
      </div>
    </header>
  );
}

function MessageView({ message }: { message: UIMessage }) {
  return (
    <Message from={message.role}>
      <MessageContent
        className={cn(
          message.role === "assistant" &&
            "max-w-none [&_pre]:font-mono [&_code]:font-mono"
        )}
      >
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <MessageResponse
                key={i}
                className="leading-7 [&>p]:my-2 [&_pre]:rounded-lg"
              >
                {part.text}
              </MessageResponse>
            );
          }
          if (part.type === "tool-mark_topic_complete") {
            const toolPart = part as ToolUIPart;
            if (toolPart.state === "output-available") {
              return null;
            }
            return (
              <div
                key={i}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Sparkles className="size-4 animate-pulse text-brand" />
                Updating lesson plan…
              </div>
            );
          }
          if (part.type === "tool-complete_lesson") {
            const toolPart = part as ToolUIPart;
            if (toolPart.state === "output-available") {
              return null;
            }
            return (
              <div
                key={i}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Sparkles className="size-4 animate-pulse text-brand" />
                Checking the mastery outcomes…
              </div>
            );
          }
          if (part.type === "tool-save_personal_intro") {
            const toolPart = part as ToolUIPart;
            if (toolPart.state === "output-available") {
              const output = toolPart.output as { ok?: boolean };
              if (output?.ok) {
                return (
                  <div
                    key={i}
                    className="rounded-lg border border-brand/25 bg-brand/5 px-3 py-2 text-sm text-muted-foreground"
                  >
                    Saved your intro — I&apos;ll remember this in future sessions.
                  </div>
                );
              }
              return null;
            }
            return (
              <div
                key={i}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Sparkles className="size-4 animate-pulse text-brand" />
                Saving your intro…
              </div>
            );
          }
          if (part.type === "tool-save_learning_preferences") {
            const toolPart = part as ToolUIPart;
            if (toolPart.state === "output-available") {
              const output = toolPart.output as {
                ok?: boolean;
                error?: string;
              };
              if (output?.ok) {
                return (
                  <div
                    key={i}
                    className="rounded-lg border border-brand/25 bg-brand/5 px-3 py-2 text-sm text-muted-foreground"
                  >
                    Saved your learning preferences — I&apos;ll tailor future
                    lessons to match.
                  </div>
                );
              }
              return null;
            }
            return (
              <div
                key={i}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Sparkles className="size-4 animate-pulse text-brand" />
                Saving your learning preferences…
              </div>
            );
          }
          return null;
        })}
      </MessageContent>
    </Message>
  );
}

function EmptyState({
  lesson,
  suggestions,
  onPick,
}: {
  lesson: Lesson;
  suggestions: string[];
  onPick: (s: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-5 py-16 text-center">
      <div className="relative inline-flex size-12 items-center justify-center rounded-2xl bg-brand/12 ring-1 ring-brand/20">
        <Sparkles className="size-6 text-brand" />
      </div>
      <div className="max-w-md space-y-2">
        <h3 className="text-lg font-semibold tracking-tight">
          Ready when you are
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {lesson.kind === "onboarding" ? (
            <>
              Start with a hello — we&apos;ll get to know you, tour every feature,
              and set your learning preferences.
            </>
          ) : (
            <>
              Say hi, ask a question, or jump straight in. We&apos;ll work
              through{" "}
              <span className="font-medium text-foreground">{lesson.title}</span>{" "}
              together at your pace.
            </>
          )}
        </p>
      </div>
      <Suggestions className="max-w-2xl justify-center pt-2">
        {suggestions.map((s) => (
          <Suggestion
            key={s}
            suggestion={s}
            onClick={onPick}
            className="border-border text-xs"
          />
        ))}
      </Suggestions>
    </div>
  );
}

function CompletionCard({
  output,
  nextLesson,
  onAdvance,
}: {
  output: CompleteLessonOutput;
  nextLesson: Lesson | null;
  onAdvance: (lessonId: string) => void;
}) {
  return (
    <div className="tutor-pop-in">
      <div className="overflow-hidden rounded-2xl border border-brand/25 bg-gradient-to-br from-brand/8 via-brand-soft/40 to-transparent shadow-sm">
        <div className="flex items-start gap-4 px-5 py-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success/15">
            <CheckCircle2 className="size-5 text-success" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">
              Lesson complete
            </p>
            <h3 className="text-base font-semibold tracking-tight">
              {output.lessonTitle ?? "Mastery reached"}
            </h3>
            {output.reason && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {output.reason}
              </p>
            )}
          </div>
        </div>
        {nextLesson && (
          <div className="flex items-center justify-between gap-3 border-t border-brand/15 bg-background/40 px-5 py-3">
            <div className="min-w-0 text-sm">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Up next
              </p>
              <p className="truncate font-medium">{nextLesson.title}</p>
            </div>
            <Button
              onClick={() => onAdvance(nextLesson.id)}
              size="lg"
              className="shrink-0"
            >
              Continue
              <ArrowRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function LockedInputNotice({
  course,
  lesson,
  nextLesson,
  onAdvance,
  alreadyCompletedBeforeChat,
  notebookOpen,
  onToggleNotebook,
}: {
  course: Course;
  lesson: Lesson;
  nextLesson: Lesson | null;
  onAdvance: (lessonId: string) => void;
  alreadyCompletedBeforeChat: boolean;
  notebookOpen: boolean;
  onToggleNotebook: () => void;
}) {
  const hasNotes = useNotebookHasNotes(course.id, lesson.id);

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      <p className="min-w-0 text-sm text-muted-foreground">
        {alreadyCompletedBeforeChat
          ? "You've already mastered this lesson. Open the next one to keep going."
          : "This lesson is complete. Ready for the next one?"}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <NotebookToggleButton
          active={notebookOpen}
          hasNotes={hasNotes}
          onClick={onToggleNotebook}
        />
        {nextLesson && (
          <Button onClick={() => onAdvance(nextLesson.id)} size="sm">
            Continue
            <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function buildSuggestions(lesson: Lesson): string[] {
  if (lesson.kind === "onboarding") {
    return [
      "Hi! I'm new here — let's start with a quick hello.",
      "Walk me through all the features in the app.",
      "What does a typical lesson look like?",
      "I'm ready to set my learning preferences.",
    ];
  }

  const seeds = [
    "I'm new to this — where should we start?",
    "Quiz me on what I should know already.",
    "Show me a quick example to anchor the idea.",
  ];
  return seeds.slice(0, 3);
}
