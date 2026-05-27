"use client";

import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import {
  ChevronRight,
  Heart,
  Mic,
  MicOff,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Conversation,
  ConversationContent,
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CoworkMessage, CoworkMode } from "@/lib/cowork-types";
import { StudyBreakControls } from "@/components/study-break";
import type { Course, Lesson } from "@/lib/syllabus";

type CoworkRailProps = {
  course: Course;
  lesson: Lesson;
  onStartBreak?: (minutes: number) => Promise<void>;
  breakActive?: boolean;
};

type PanelMode = CoworkMode | null;

function storedToUiMessages(stored: CoworkMessage[]): UIMessage[] {
  return stored.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: "text" as const, text: m.content }],
  }));
}

function uiToStored(messages: UIMessage[]): CoworkMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(""),
    }))
    .filter((m) => m.content.trim().length > 0);
}

export function CoworkRail({
  course,
  lesson,
  onStartBreak,
  breakActive = false,
}: CoworkRailProps) {
  const [open, setOpen] = useState<PanelMode>(null);

  return (
    <div className="relative flex h-full shrink-0">
      {open && (
        <CoworkPanel
          key={`${open}-${lesson.id}`}
          course={course}
          lesson={lesson}
          mode={open}
          onClose={() => setOpen(null)}
        />
      )}
      <div className="cowork-rail flex w-[4.25rem] flex-col items-center gap-3 border-l border-border/60 px-2 py-4">
        <p className="cowork-rail-label mb-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/80 [writing-mode:vertical-rl] rotate-180">
          Cowork
        </p>
        <CoworkTab
          icon={Heart}
          label="Friend"
          subtitle="Chat about anything"
          active={open === "friend"}
          variant="friend"
          onClick={() => setOpen(open === "friend" ? null : "friend")}
        />
        <CoworkTab
          icon={Users}
          label="Study buddy"
          subtitle="Voice-style study chat"
          active={open === "study-buddy"}
          variant="buddy"
          onClick={() =>
            setOpen(open === "study-buddy" ? null : "study-buddy")
          }
        />
        <div className="min-h-2 flex-1" />
        {onStartBreak && (
          <StudyBreakControls
            variant="rail"
            onStartBreak={(m) => void onStartBreak(m)}
            breakActive={breakActive}
          />
        )}
      </div>
    </div>
  );
}

function CoworkTab({
  icon: Icon,
  label,
  subtitle,
  active,
  variant,
  onClick,
}: {
  icon: typeof Heart;
  label: string;
  subtitle: string;
  active: boolean;
  variant: "friend" | "buddy";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label} — ${subtitle}`}
      className={cn(
        "group relative flex w-full flex-col items-center gap-1.5 rounded-2xl border px-1 py-3 transition-all duration-200",
        variant === "friend"
          ? active
            ? "cowork-tab-friend-active border-rose-300/60 bg-gradient-to-b from-rose-50 to-orange-50 shadow-md shadow-rose-200/40"
            : "border-transparent bg-rose-500/5 hover:border-rose-200/50 hover:bg-rose-500/10"
          : active
            ? "cowork-tab-buddy-active border-emerald-300/60 bg-gradient-to-b from-emerald-50 to-teal-50 shadow-md shadow-emerald-200/40"
            : "border-transparent bg-emerald-500/5 hover:border-emerald-200/50 hover:bg-emerald-500/10"
      )}
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-xl transition-transform group-hover:scale-105",
          variant === "friend"
            ? "bg-gradient-to-br from-rose-400 to-orange-400 text-white shadow-inner"
            : "bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-inner"
        )}
      >
        <Icon className="size-5" strokeWidth={2.2} />
      </span>
      <span className="max-w-full px-0.5 text-center text-[9px] font-semibold leading-tight text-foreground/90">
        {label}
      </span>
      {active && (
        <ChevronRight
          className={cn(
            "absolute -left-1 top-1/2 size-3.5 -translate-y-1/2",
            variant === "friend" ? "text-rose-400" : "text-emerald-500"
          )}
        />
      )}
    </button>
  );
}

function CoworkPanel({
  course,
  lesson,
  mode,
  onClose,
}: {
  course: Course;
  lesson: Lesson;
  mode: CoworkMode;
  onClose: () => void;
}) {
  const isBuddy = mode === "study-buddy";
  const [input, setInput] = useState("");
  const [voiceOut, setVoiceOut] = useState(isBuddy);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const loadedRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const lastSpokenRef = useRef<string | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/cowork",
        body: {
          courseId: course.id,
          lessonId: lesson.id,
          mode,
        },
      }),
    [course.id, lesson.id, mode]
  );

  const { messages, sendMessage, status, setMessages, error } = useChat({
    transport,
  });

  const isStreaming = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSpeechSupported(!!SR);
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript?.trim();
      if (text) {
        sendMessage({ text });
        setInput("");
      }
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
  }, [sendMessage]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/cowork?courseId=${encodeURIComponent(course.id)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((store) => {
        if (cancelled || !store) return;
        const thread =
          mode === "friend" ? store.friend : store.studyBuddy;
        if (thread?.messages?.length) {
          setMessages(storedToUiMessages(thread.messages));
        }
        loadedRef.current = true;
      })
      .catch(() => {
        loadedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [course.id, mode, setMessages]);

  const persist = useCallback(
    async (msgs: UIMessage[]) => {
      if (!loadedRef.current) return;
      await fetch("/api/cowork", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: course.id,
          mode,
          messages: uiToStored(msgs),
        }),
      });
    },
    [course.id, mode]
  );

  useEffect(() => {
    if (!loadedRef.current || isStreaming) return;
    if (messages.length === 0) return;
    persist(messages);
  }, [messages, isStreaming, persist]);

  useEffect(() => {
    if (!isBuddy || !voiceOut || isStreaming) return;
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (!last) return;
    const text = last.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
    if (!text || last.id === lastSpokenRef.current) return;
    lastSpokenRef.current = last.id;
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.02;
    utter.pitch = 1.05;
    window.speechSynthesis.speak(utter);
  }, [messages, isBuddy, voiceOut, isStreaming]);

  const toggleListen = () => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    setListening(true);
    recognitionRef.current.start();
  };

  const handleSubmit = (msg: PromptInputMessage) => {
    const text = msg.text.trim();
    if (!text || isStreaming) return;
    sendMessage({ text });
    setInput("");
  };

  const persona = isBuddy
    ? { name: "Sam", role: "Study buddy", emoji: "🎧" }
    : { name: "Alex", role: "Friend", emoji: "☕" };

  return (
    <div
      className={cn(
        "absolute right-[4.25rem] top-0 z-30 flex h-full w-[min(24rem,42vw)] flex-col border-l shadow-2xl animate-in slide-in-from-right-4 duration-300",
        isBuddy
          ? "cowork-panel-buddy border-emerald-200/50"
          : "cowork-panel-friend border-rose-200/50"
      )}
    >
      <header
        className={cn(
          "flex items-start justify-between gap-3 border-b px-4 py-4",
          isBuddy
            ? "border-emerald-200/40 bg-gradient-to-r from-emerald-50/95 to-teal-50/80"
            : "border-rose-200/40 bg-gradient-to-r from-rose-50/95 to-orange-50/80"
        )}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">{persona.emoji}</span>
            <div>
              <p className="text-sm font-semibold tracking-tight">
                {persona.name}
              </p>
              <p className="text-[11px] text-muted-foreground">{persona.role}</p>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {isBuddy
              ? `Talk through "${lesson.title}" — Sam learns with you, asks questions, and keeps it conversational.`
              : "Casual chat — no quizzes, no pressure. Talk about anything."}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="shrink-0 rounded-full"
        >
          <X className="size-4" />
        </Button>
      </header>

      {isBuddy && (
        <div className="flex items-center justify-between gap-2 border-b border-emerald-100/80 bg-emerald-50/50 px-4 py-2">
          <div className="flex items-center gap-2">
            {listening ? (
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                <span className="cowork-pulse flex gap-0.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="inline-block h-3 w-0.5 rounded-full bg-emerald-500"
                      style={{ animationDelay: `${i * 120}ms` }}
                    />
                  ))}
                </span>
                Listening…
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                Voice-style study chat
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setVoiceOut((v) => !v)}
              title={voiceOut ? "Mute Sam's voice" : "Hear Sam's replies"}
              className="rounded-full text-emerald-700 hover:bg-emerald-100/80"
            >
              {voiceOut ? (
                <Volume2 className="size-4" />
              ) : (
                <VolumeX className="size-4" />
              )}
            </Button>
            {speechSupported && (
              <Button
                type="button"
                size="icon-sm"
                onClick={toggleListen}
                className={cn(
                  "rounded-full",
                  listening
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25"
                )}
                title="Hold to talk (mic)"
              >
                {listening ? (
                  <MicOff className="size-4" />
                ) : (
                  <Mic className="size-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      )}

      <Conversation className="min-h-0 flex-1 bg-background/40">
        <ConversationContent className="gap-4 px-4 py-4">
          {messages.length === 0 && (
            <div
              className={cn(
                "rounded-2xl border px-4 py-5 text-center",
                isBuddy
                  ? "border-emerald-200/50 bg-emerald-50/40"
                  : "border-rose-200/50 bg-rose-50/40"
              )}
            >
              <Sparkles
                className={cn(
                  "mx-auto mb-2 size-5",
                  isBuddy ? "text-emerald-500" : "text-rose-400"
                )}
              />
              <p className="text-sm font-medium">
                {isBuddy ? "Hey — ready to study together?" : "Hey! What's up?"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isBuddy
                  ? "Tap the mic or type — Sam will ask questions like a classmate would."
                  : "Say hi, vent, or talk about whatever's on your mind."}
              </p>
            </div>
          )}
          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent
                className={cn(
                  "max-w-none text-sm leading-relaxed",
                  message.role === "assistant" &&
                    (isBuddy
                      ? "rounded-2xl rounded-tl-md bg-emerald-500/10 px-3.5 py-2.5"
                      : "rounded-2xl rounded-tl-md bg-rose-500/10 px-3.5 py-2.5")
                )}
              >
                {message.parts.map((part, i) =>
                  part.type === "text" ? (
                    <MessageResponse key={i}>{part.text}</MessageResponse>
                  ) : null
                )}
              </MessageContent>
            </Message>
          ))}
          {error && (
            <p className="text-xs text-destructive">{error.message}</p>
          )}
        </ConversationContent>
      </Conversation>

      <div
        className={cn(
          "border-t p-3",
          isBuddy ? "border-emerald-100 bg-emerald-50/30" : "border-rose-100 bg-rose-50/30"
        )}
      >
        <PromptInput
          onSubmit={handleSubmit}
          className={cn(
            "rounded-2xl border bg-card shadow-sm",
            isBuddy
              ? "border-emerald-200/60 focus-within:ring-emerald-300/30"
              : "border-rose-200/60 focus-within:ring-rose-300/30"
          )}
        >
          <PromptInputTextarea
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            placeholder={
              isBuddy ? "Explain it to Sam…" : "Say anything…"
            }
            disabled={isStreaming}
            className="min-h-[2.5rem] text-sm"
          />
          <div className="flex justify-end px-2 pb-2">
            <PromptInputSubmit status={status} disabled={!input.trim()} />
          </div>
        </PromptInput>
      </div>
    </div>
  );
}
