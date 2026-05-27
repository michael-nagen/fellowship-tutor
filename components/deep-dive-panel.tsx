"use client";

import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { History, Telescope, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { InputGroupButton } from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { DeepDiveEntry } from "@/lib/deep-dive";
import type { Course, Lesson } from "@/lib/syllabus";

export type DeepDiveTarget = {
  lessonId: string;
  lessonTitle: string;
  topicIndex: number;
  topicLabel: string;
};

type DeepDivePanelProps = {
  course: Course;
  lesson: Lesson;
  target: DeepDiveTarget;
  onClose: () => void;
  onSelectHistory: (target: DeepDiveTarget) => void;
};

function storedToUiMessages(
  stored: DeepDiveEntry["messages"]
): UIMessage[] {
  return stored.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: "text" as const, text: m.content }],
  }));
}

export function DeepDivePanel({
  course,
  lesson,
  target,
  onClose,
  onSelectHistory,
}: DeepDivePanelProps) {
  const [input, setInput] = useState("");
  const [entryId, setEntryId] = useState<string | null>(null);
  const [history, setHistory] = useState<DeepDiveEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const startedRef = useRef(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/deep-dive",
        body: {
          courseId: course.id,
          lessonId: target.lessonId,
          topicIndex: target.topicIndex,
          entryId,
        },
      }),
    [course.id, target.lessonId, target.topicIndex, entryId]
  );

  const { messages, sendMessage, status, setMessages, error } = useChat({
    transport,
    id: `${course.id}-${target.lessonId}-${target.topicIndex}`,
  });

  const isStreaming = status === "submitted" || status === "streaming";

  const loadHistory = useCallback(async () => {
    const res = await fetch(
      `/api/deep-dive?courseId=${encodeURIComponent(course.id)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return;
    const data = (await res.json()) as { entries: DeepDiveEntry[] };
    setHistory(data.entries ?? []);
  }, [course.id]);

  const loadEntry = useCallback(async () => {
    startedRef.current = false;
    const res = await fetch(
      `/api/deep-dive?courseId=${encodeURIComponent(course.id)}&lessonId=${encodeURIComponent(target.lessonId)}&topicIndex=${target.topicIndex}`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const entry = (await res.json()) as DeepDiveEntry;
      setEntryId(entry.id);
      if (entry.messages.length > 0) {
        setMessages(storedToUiMessages(entry.messages));
        startedRef.current = true;
        return;
      }
    }
    setEntryId(null);
    setMessages([]);
  }, [course.id, target.lessonId, target.topicIndex, setMessages]);

  useEffect(() => {
    loadHistory();
    loadEntry();
  }, [loadHistory, loadEntry]);

  useEffect(() => {
    if (startedRef.current || isStreaming) return;
    if (messages.length > 0) return;
    startedRef.current = true;
    sendMessage({
      text: "Give me a deep dive — how it works in practice, behind the scenes, and videos worth watching.",
    });
  }, [messages.length, isStreaming, sendMessage]);

  useEffect(() => {
    if (isStreaming || messages.length === 0) return;
    const save = async () => {
      const res = await fetch(
        `/api/deep-dive?courseId=${encodeURIComponent(course.id)}&lessonId=${encodeURIComponent(target.lessonId)}&topicIndex=${target.topicIndex}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const entry = (await res.json()) as DeepDiveEntry;
      setEntryId(entry.id);
      await fetch("/api/deep-dive", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: course.id,
          entryId: entry.id,
          messages: messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              id: m.id,
              role: m.role,
              content: m.parts
                .filter((p) => p.type === "text")
                .map((p) => (p.type === "text" ? p.text : ""))
                .join("\n"),
            }))
            .filter((m) => m.content.trim()),
        }),
      });
      loadHistory();
    };
    save();
  }, [isStreaming, messages, course.id, target.lessonId, target.topicIndex, loadHistory]);

  const handleSubmit = useCallback(
    (msg: PromptInputMessage) => {
      const text = msg.text.trim();
      if (!text || isStreaming) return;
      sendMessage({ text });
      setInput("");
    },
    [isStreaming, sendMessage]
  );

  return (
    <div className="deep-dive-panel flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-brand/12 px-3 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand/80">
            <Telescope className="size-3.5" />
            Deep dive
          </div>
          <p className="mt-0.5 truncate text-xs font-medium text-foreground">
            {target.topicLabel}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            {target.lessonTitle}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <InputGroupButton
            type="button"
            size="icon-xs"
            variant={showHistory ? "secondary" : "ghost"}
            onClick={() => setShowHistory((v) => !v)}
            aria-label="History"
            className="text-muted-foreground"
          >
            <History className="size-3.5" />
          </InputGroupButton>
          <InputGroupButton
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={onClose}
            aria-label="Close deep dive"
            className="text-muted-foreground"
          >
            <X className="size-3.5" />
          </InputGroupButton>
        </div>
      </div>

      {showHistory && history.length > 0 && (
        <ScrollArea className="max-h-32 shrink-0 border-b border-brand/10 bg-brand/5">
          <div className="space-y-1 p-2">
            {history.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  onSelectHistory({
                    lessonId: entry.lessonId,
                    lessonTitle: entry.lessonTitle,
                    topicIndex: entry.topicIndex,
                    topicLabel: entry.topicLabel,
                  });
                  setShowHistory(false);
                }}
                className={cn(
                  "w-full rounded-md px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-brand/8",
                  entry.lessonId === target.lessonId &&
                    entry.topicIndex === target.topicIndex &&
                    "bg-brand/10 ring-1 ring-brand/15"
                )}
              >
                <p className="truncate font-medium text-foreground">
                  {entry.topicLabel}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {entry.lessonTitle}
                </p>
              </button>
            ))}
          </div>
        </ScrollArea>
      )}

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-4 px-3 py-3">
          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <MessageContent
                className={cn(
                  message.role === "assistant" &&
                    "max-w-none text-xs [&_a]:text-brand [&_a]:underline [&>p]:my-1.5"
                )}
              >
                {message.parts.map((part, i) =>
                  part.type === "text" ? (
                    <MessageResponse key={i} className="leading-relaxed">
                      {part.text}
                    </MessageResponse>
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

      <div className="shrink-0 border-t border-brand/10 p-2">
        <PromptInput
          onSubmit={handleSubmit}
          className="rounded-xl border border-brand/15 bg-card/80"
        >
          <PromptInputTextarea
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            placeholder="Ask a follow-up…"
            className="min-h-8 text-xs"
            disabled={isStreaming}
          />
          <div className="flex justify-end px-2 pb-1.5">
            <PromptInputSubmit
              status={status}
              disabled={!input.trim() && !isStreaming}
            />
          </div>
        </PromptInput>
      </div>
    </div>
  );
}
