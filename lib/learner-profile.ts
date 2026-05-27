import { promises as fs } from "node:fs";
import path from "node:path";

export type LearnerProfile = {
  /** Short paragraph injected into the system prompt for delivery style. */
  preferencesSummary: string;
  /** Verbatim learner input, kept for reference. */
  rawPreferences: string;
  /** How the learner prefers to be addressed. */
  preferredName?: string;
  /** Warm summary from onboarding personal chat — goals, context, tone. */
  personalSummary?: string;
  rawPersonalIntro?: string;
  updatedAt: string;
};

const PROFILE_DIR = path.join(process.cwd(), "data", "learner");
const PROFILE_PATH = path.join(PROFILE_DIR, "profile.json");

const BLOCKED_PATTERNS: RegExp[] = [
  /\b(cheat|cheating)\b/i,
  /\b(skip|bypass|avoid)\b.+\b(quiz|quizzes|questions?|checkpoints?|teach[- ]back|mastery)\b/i,
  /\b(give|hand)\b.+\b(answers?|solutions?)\b.+\b(without|no)\b/i,
  /\bcomplete\b.+\b(without|before)\b/i,
  /\b(don'?t|do not|never)\b.+\b(ask|quiz|test|challenge)\b/i,
  /\bjust tell me\b/i,
  /\bdo my (homework|assignment|work)\b/i,
  // Hebrew — preferences must not bypass learning requirements
  /(?:ל)?רמ(?:א|אות)/,
  /(?:ל)?ד(?:לג|ילוג)/,
  /בלי\s+שאלות/,
  /(?:אל|לא)\s+(?:ת)?(?:שאל|שואל|בחן)/,
  /(?:ת)?(?:ן|ני)\s*(?:לי\s+)?(?:את\s+)?(?:ה)?תשובות\s*(?:בלי|ללא|ישר)/,
  /(?:בלי|ללא)\s+(?:ל)?(?:למוד|לענות|בדיק)/,
  /(?:ע(?:ש|)ה|תע(?:ש|)ה)\s+לי\s+(?:את\s+)?(?:ה)?(?:שיעור|ש(?:\"|')?ע|מטלה|עבוד)/,
  /(?:ס(?:מ|)ן|סיים)\s*(?:לי\s+)?(?:את\s+)?(?:ה)?שיעור\s*(?:בלי|לפני|מבלי)/,
  /(?:ת)?ג(?:יד|ני)\s*(?:לי\s+)?(?:ישר|יישר)\s*(?:את\s+)?(?:ה)?(?:תשובה|פתרון)/,
];

async function ensureDir(): Promise<void> {
  await fs.mkdir(PROFILE_DIR, { recursive: true });
}

export function validateLearningPreferences(text: string): {
  ok: true;
} | {
  ok: false;
  reason: string;
} {
  const trimmed = text.trim();
  if (trimmed.length < 8) {
    return {
      ok: false,
      reason: "Please share a bit more detail about how you like to learn.",
    };
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        ok: false,
        reason:
          "Preferences cannot skip mastery checks, quizzes, teach-back, or ask for answers without learning. Share how you like content delivered — pace, examples, tone — instead.",
      };
    }
  }
  return { ok: true };
}

export async function readLearnerProfile(): Promise<LearnerProfile | null> {
  await ensureDir();
  try {
    const raw = await fs.readFile(PROFILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<LearnerProfile>;
    if (
      typeof parsed.preferencesSummary !== "string" ||
      typeof parsed.rawPreferences !== "string"
    ) {
      return null;
    }
    return {
      preferencesSummary: parsed.preferencesSummary,
      rawPreferences: parsed.rawPreferences,
      preferredName: parsed.preferredName,
      personalSummary: parsed.personalSummary,
      rawPersonalIntro: parsed.rawPersonalIntro,
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

export async function saveLearnerProfile(args: {
  rawPreferences: string;
  preferencesSummary: string;
}): Promise<LearnerProfile> {
  await ensureDir();
  const existing = await readLearnerProfile();
  const next: LearnerProfile = {
    rawPreferences: args.rawPreferences.trim(),
    preferencesSummary: args.preferencesSummary.trim(),
    preferredName: existing?.preferredName,
    personalSummary: existing?.personalSummary,
    rawPersonalIntro: existing?.rawPersonalIntro,
    updatedAt: new Date().toISOString(),
  };
  const tmpPath = `${PROFILE_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(tmpPath, PROFILE_PATH);
  return next;
}

export async function savePersonalIntro(args: {
  preferredName?: string;
  rawPersonalIntro: string;
  personalSummary: string;
}): Promise<LearnerProfile> {
  await ensureDir();
  const existing = await readLearnerProfile();
  const next: LearnerProfile = {
    preferencesSummary:
      existing?.preferencesSummary ?? "Standard tutoring style until preferences are saved.",
    rawPreferences: existing?.rawPreferences ?? "",
    preferredName: args.preferredName?.trim() || undefined,
    personalSummary: args.personalSummary.trim(),
    rawPersonalIntro: args.rawPersonalIntro.trim(),
    updatedAt: new Date().toISOString(),
  };
  const tmpPath = `${PROFILE_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(tmpPath, PROFILE_PATH);
  return next;
}

export function formatLearnerPreferencesForPrompt(
  profile: LearnerProfile | null
): string {
  if (!profile) {
    return "No custom learning preferences saved yet. Use the default tutoring style.";
  }

  const parts: string[] = [];

  if (profile.personalSummary || profile.preferredName) {
    parts.push(
      "**Personal context (from onboarding):**",
      profile.preferredName
        ? `Address them as **${profile.preferredName}** when natural.`
        : "",
      profile.personalSummary ?? "",
      ""
    );
  }

  parts.push(
    "This learner saved delivery preferences during onboarding. Follow them for **how** you teach (pace, examples, tone, structure) in every response.",
    "They do **not** override mastery checks, MC questions, teach-back, lesson completion rules, or anti-cheating constraints.",
    "",
    profile.preferencesSummary || "Standard tutoring style."
  );

  return parts.filter(Boolean).join("\n");
}
