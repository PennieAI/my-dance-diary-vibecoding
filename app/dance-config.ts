export type Difficulty = "零基础" | "入门" | "提高" | "进阶";

export type Course = {
  id: string;
  time: string;
  style: string;
  teacher: string;
  level: Difficulty;
};

// Demo values only. Replace them with your own membership and practice goal.
export const ANNUAL_SPEND = 3600;
export const TARGET_COUNT = 120;
export const STORAGE_KEY = "my-dance-diary-demo-v1";
export const DEFAULT_START = "2026-01-01";
export const DEFAULT_END = "2026-12-31";

// Demo schedule only. Keys follow JavaScript's weekday convention:
// 0 = Sunday, 1 = Monday, ... 6 = Saturday.
export const SCHEDULE: Record<number, Course[]> = {
  0: [
    { id: "sun-1600-jazz-a", time: "16:00–17:30", style: "JAZZ", teacher: "老师 A", level: "入门" },
    { id: "sun-1730-kpop-b", time: "17:30–19:00", style: "KPOP", teacher: "老师 B", level: "零基础" },
  ],
  1: [
    { id: "mon-1900-jazz-a", time: "19:00–20:30", style: "JAZZ", teacher: "老师 A", level: "入门" },
    { id: "mon-1900-hiphop-b", time: "19:00–20:30", style: "HIPHOP", teacher: "老师 B", level: "提高" },
    { id: "mon-2030-kpop-c", time: "20:30–22:00", style: "KPOP", teacher: "老师 C", level: "零基础" },
  ],
  3: [
    { id: "wed-1900-choreo-c", time: "19:00–20:30", style: "CHOREO", teacher: "老师 C", level: "提高" },
    { id: "wed-2030-hiphop-b", time: "20:30–22:00", style: "HIPHOP", teacher: "老师 B", level: "入门" },
  ],
  6: [
    { id: "sat-1600-jazz-a", time: "16:00–17:30", style: "JAZZ", teacher: "老师 A", level: "进阶" },
    { id: "sat-1730-choreo-c", time: "17:30–19:00", style: "CHOREO", teacher: "老师 C", level: "入门" },
  ],
};
