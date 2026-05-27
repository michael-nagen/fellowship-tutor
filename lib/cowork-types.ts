export type CoworkMode = "friend" | "study-buddy";

export type CoworkMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type CoworkThread = {
  messages: CoworkMessage[];
  updatedAt: string;
};

export type CoworkStore = {
  courseId: string;
  friend: CoworkThread;
  studyBuddy: CoworkThread;
  updatedAt: string;
};
