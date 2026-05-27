export const MINUTES_PER_TOPIC = 12;
export const WRAP_UP_MINUTES = 3;
export const BREAK_PRESETS = [5, 10, 15] as const;
export const EXTEND_PRESETS = [15, 30] as const;

export type SessionTopic = {
  lessonId: string;
  lessonTitle: string;
  topicIndex: number;
  label: string;
  estimatedMinutes: number;
};

export type TimeSessionStatus = "active" | "paused" | "ended";

export type TimeSessionRecord = {
  sessionId: string;
  courseId: string;
  budgetMinutes: number;
  startedAt: string;
  status: TimeSessionStatus;
  pausedAt?: string;
  /** When set, resume counts this many minutes as break (not session time). */
  intendedBreakMinutes?: number;
  accumulatedPauseMs: number;
  /** Topics the tutor should cover this session (computed from budget). */
  plannedTopics: SessionTopic[];
  /** Next topics if learner finishes planned block early. */
  bonusTopics: SessionTopic[];
  /** Topics explicitly deferred to a future session. */
  deferredTopics: SessionTopic[];
  coveredKeys: string[];
  uncoveredKeys: string[];
  lastSummary?: string;
  updatedAt: string;
};

export function topicKey(lessonId: string, topicIndex: number): string {
  return `${lessonId}:${topicIndex}`;
}

export function getEffectiveRemainingMinutes(args: {
  budgetMinutes: number;
  startedAt: string;
  accumulatedPauseMs: number;
  pausedAt?: string;
  status: TimeSessionStatus;
}): number {
  const started = new Date(args.startedAt).getTime();
  const now = Date.now();
  const pauseExtra = args.pausedAt ? now - new Date(args.pausedAt).getTime() : 0;
  const elapsed = Math.floor(
    (now - started - args.accumulatedPauseMs - pauseExtra) / 60_000
  );
  return Math.max(0, args.budgetMinutes - elapsed);
}

export function maxTopicsForMinutes(minutes: number): number {
  const usable = Math.max(0, minutes - WRAP_UP_MINUTES);
  if (usable < MINUTES_PER_TOPIC) return minutes >= MINUTES_PER_TOPIC ? 1 : 0;
  return Math.floor(usable / MINUTES_PER_TOPIC);
}

export function formatBudgetLabel(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  return `${minutes} min`;
}

export function describeSessionCapacity(minutes: number): {
  topicCount: number;
  label: string;
} {
  const topicCount = maxTopicsForMinutes(minutes);
  return {
    topicCount,
    label: `~${topicCount} mastery topic${topicCount === 1 ? "" : "s"} (~${MINUTES_PER_TOPIC} min each)`,
  };
}

export function groupSessionTopics(
  topics: SessionTopic[]
): { lessonId: string; lessonTitle: string; topics: SessionTopic[] }[] {
  const groups: {
    lessonId: string;
    lessonTitle: string;
    topics: SessionTopic[];
  }[] = [];
  const index = new Map<string, number>();

  for (const topic of topics) {
    const i = index.get(topic.lessonId);
    if (i === undefined) {
      index.set(topic.lessonId, groups.length);
      groups.push({
        lessonId: topic.lessonId,
        lessonTitle: topic.lessonTitle,
        topics: [topic],
      });
    } else {
      groups[i]!.topics.push(topic);
    }
  }

  return groups;
}
