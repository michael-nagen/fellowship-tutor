export type BreakSuggestion = {
  kind: "youtube" | "tip";
  title: string;
  detail: string;
  href?: string;
};

type BreakActivitySet = {
  workout: BreakSuggestion;
  extra: BreakSuggestion;
};

const ACTIVITIES: Record<5 | 10 | 15, BreakActivitySet> = {
  5: {
    workout: {
      kind: "youtube",
      title: "5-min desk stretch",
      detail: "Quick neck, shoulder, and back release — perfect at your chair.",
      href: "https://www.youtube.com/watch?v=s5_01W7XUHA",
    },
    extra: {
      kind: "tip",
      title: "Hydrate & reset your eyes",
      detail: "Drink water and look at something 20 ft away for 20 seconds (20-20-20 rule).",
    },
  },
  10: {
    workout: {
      kind: "youtube",
      title: "10-min gentle yoga break",
      detail: "Full-body stretch flow to wake up without breaking a sweat.",
      href: "https://www.youtube.com/watch?v=ULahq26MedA",
    },
    extra: {
      kind: "tip",
      title: "Walk around the room",
      detail: "Two slow laps indoors — movement helps memory and focus when you return.",
    },
  },
  15: {
    workout: {
      kind: "youtube",
      title: "15-min office workout",
      detail: "Light standing moves — no equipment, beginner-friendly.",
      href: "https://www.youtube.com/watch?v=g_tea8ZNk5A",
    },
    extra: {
      kind: "tip",
      title: "Snack + sunlight if you can",
      detail: "A small healthy snack and a few minutes near a window boost energy for the next block.",
    },
  },
};

export function getBreakSuggestions(durationMinutes: number): BreakSuggestion[] {
  const bucket: 5 | 10 | 15 =
    durationMinutes <= 5 ? 5 : durationMinutes <= 10 ? 10 : 15;
  const set = ACTIVITIES[bucket];
  return [set.workout, set.extra];
}
