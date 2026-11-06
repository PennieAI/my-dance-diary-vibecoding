"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ANNUAL_SPEND,
  BACKUP_APP_ID,
  DEFAULT_END,
  DEFAULT_START,
  MONTHLY_TARGET,
  SCHEDULE,
  STORAGE_KEY,
  TARGET_COUNT,
} from "./dance-config";
import type { Course, Difficulty } from "./dance-config";

type CalendarView = "month" | "week";

type SavedState = {
  startDate: string;
  endDate: string;
  checkins: string[];
  ratings?: Record<string, number>;
};

type BackupFile = {
  app: string;
  version: 1;
  exportedAt: string;
  data: SavedState;
};

type BackupNotice = {
  tone: "success" | "error";
  text: string;
};

const CHINA_TIME_ZONE = "Asia/Shanghai";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const WEEKDAY_NAMES = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
];

const RATING_GUIDE = [
  { score: 1, label: "完成到场", detail: "完整上完课；放炮较多，但没有放弃。" },
  { score: 2, label: "基本跟上", detail: "记住主要动作和节奏；偶尔会放炮。" },
  { score: 3, label: "稳定完成", detail: "基本不放炮；动作、节奏和方向较完整。" },
  { score: 4, label: "敢于 SOLO", detail: "稳定不放炮；能独立完整跳，敢主动 SOLO。" },
  { score: 5, label: "高光共舞", detail: "稳定 SOLO；敢和老师共舞，或被选中一起跳。" },
] as const;

const DIFFICULTY_META: Record<Difficulty, { className: string; short: string }> = {
  零基础: { className: "level-zero", short: "零基" },
  入门: { className: "level-entry", short: "入门" },
  提高: { className: "level-improve", short: "提高" },
  进阶: { className: "level-advanced", short: "进阶" },
};
const DIFFICULTY_ORDER: Difficulty[] = ["零基础", "入门", "提高", "进阶"];
const DIFFICULTY_VALUE: Record<Difficulty, number> = {
  零基础: 1,
  入门: 2,
  提高: 3,
  进阶: 4,
};

const COURSE_BY_ID = Object.fromEntries(
  Object.values(SCHEDULE).flat().map((course) => [course.id, course]),
);

function scheduleForDate(key: string) {
  return SCHEDULE[dateFromKey(key).getDay()] || [];
}

function danceIndex(course: Course, rating: number) {
  return DIFFICULTY_VALUE[course.level] * rating;
}

function groupCoursesByTime(courses: Course[]) {
  const groups = new Map<string, Course[]>();
  courses.forEach((course) => {
    groups.set(course.time, [...(groups.get(course.time) || []), course]);
  });
  return Array.from(groups, ([time, groupedCourses]) => ({
    time,
    courses: groupedCourses,
  }));
}

function summarizeDifficulty(courses: Course[]) {
  const values = Array.from(
    new Set(courses.map((course) => DIFFICULTY_VALUE[course.level])),
  ).sort((left, right) => left - right);
  return values.length === 1
    ? `D${values[0]}`
    : `D${values[0]}–D${values[values.length - 1]}`;
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDateKey(key: string, days: number) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function weekCells(key: string) {
  const selected = dateFromKey(key);
  const start = new Date(selected);
  start.setDate(selected.getDate() - selected.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function formatChineseDate(key: string) {
  const date = dateFromKey(key);
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${WEEKDAY_NAMES[date.getDay()]}`;
}

function inclusiveDays(start: string, end: string) {
  const startTime = dateFromKey(start).getTime();
  const endTime = dateFromKey(end).getTime();
  return Math.max(1, Math.floor((endTime - startTime) / 86400000) + 1);
}

function migrateDefaultEnd(value?: string) {
  return value || DEFAULT_END;
}

function monthCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const sundayOffset = first.getDay();
  const start = new Date(year, month, 1 - sundayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function monthIndex(key: string) {
  const date = dateFromKey(key);
  return date.getFullYear() * 12 + date.getMonth();
}

function chinaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function clampDateKey(key: string, start: string, end: string) {
  if (key < start) return start;
  if (key > end) return end;
  return key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return dateKey(dateFromKey(value)) === value;
}

function parseBackup(value: unknown): SavedState {
  if (isRecord(value) && "data" in value) {
    if (value.version !== 1 || !isRecord(value.data)) {
      throw new Error("该文件不是兼容的 My Dance Diary 备份。");
    }
  }
  const source = isRecord(value) && isRecord(value.data) ? value.data : value;
  if (!isRecord(source)) throw new Error("文件内容不是有效的练舞日记备份。");

  const { startDate, endDate, checkins, ratings } = source;
  if (!isValidDateKey(startDate) || !isValidDateKey(endDate) || startDate > endDate) {
    throw new Error("备份中的年卡日期无效。");
  }
  if (!Array.isArray(checkins) || checkins.length > 5000 || !checkins.every((entry) => typeof entry === "string")) {
    throw new Error("备份中的打卡记录无效。");
  }
  if (ratings !== undefined && !isRecord(ratings)) {
    throw new Error("备份中的评分记录无效。");
  }

  const cleanCheckins = Array.from(new Set(checkins.filter(
    (entry) => /^\d{4}-\d{2}-\d{2}::[^:]+$/.test(entry) && isValidDateKey(entry.slice(0, 10)),
  )));
  if (cleanCheckins.length !== checkins.length) {
    throw new Error("备份中包含无法识别的打卡记录。");
  }
  const checkinSet = new Set(cleanCheckins);
  const cleanRatings = Object.fromEntries(
    Object.entries(ratings || {}).filter(
      ([entry, score]) => checkinSet.has(entry) && Number.isInteger(score) && Number(score) >= 1 && Number(score) <= 5,
    ),
  );

  return {
    startDate,
    endDate: migrateDefaultEnd(endDate),
    checkins: cleanCheckins,
    ratings: cleanRatings,
  };
}

function danceCategory(style: string) {
  const normalized = style.toUpperCase();
  if (normalized.includes("HIPHOP") && normalized.includes("SWAG")) return "HIPHOP/SWAG";
  if (normalized.includes("CHOREO")) return "CHOREO";
  if (normalized.includes("HIPHOP")) return "HIPHOP";
  if (normalized.includes("SWAG")) return "SWAG";
  if (normalized.includes("KPOP")) return "KPOP";
  if (normalized.includes("JAZZ")) return "JAZZ";
  return style;
}

function monthKeysBetween(start: string, end: string) {
  const cursor = dateFromKey(`${start.slice(0, 7)}-01`);
  const last = dateFromKey(`${end.slice(0, 7)}-01`);
  const keys: string[] = [];
  while (cursor <= last) {
    keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

export function DanceCalendar() {
  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [endDate, setEndDate] = useState(DEFAULT_END);
  const [selectedDate, setSelectedDate] = useState(DEFAULT_START);
  const [viewMonth, setViewMonth] = useState(monthIndex(DEFAULT_START));
  const [calendarView, setCalendarView] = useState<CalendarView>("month");
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [checkins, setCheckins] = useState<Set<string>>(new Set());
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [ratingCourseId, setRatingCourseId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [backupNotice, setBackupNotice] = useState<BackupNotice | null>(null);
  const [monthWindowOffset, setMonthWindowOffset] = useState(0);
  const importInputRef = useRef<HTMLInputElement>(null);
  const backupPanelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let safeStart = DEFAULT_START;
    let safeEnd = DEFAULT_END;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as SavedState;
        safeStart = saved.startDate || DEFAULT_START;
        safeEnd = migrateDefaultEnd(saved.endDate);
        setStartDate(safeStart);
        setEndDate(safeEnd);
        setCheckins(new Set(saved.checkins || []));
        setRatings(
          Object.fromEntries(
            Object.entries(saved.ratings || {}).filter(
              ([, score]) => Number.isInteger(score) && score >= 1 && score <= 5,
            ),
          ),
        );
      }
    } catch {
      // A malformed local record should never block the calendar.
    } finally {
      const previousChinaDate = clampDateKey(
        shiftDateKey(chinaDateKey(), -1),
        safeStart,
        safeEnd,
      );
      setSelectedDate(previousChinaDate);
      setViewMonth(monthIndex(previousChinaDate));
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const saved: SavedState = {
      startDate,
      endDate,
      checkins: Array.from(checkins),
      ratings,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }, [startDate, endDate, checkins, ratings, loaded]);

  useEffect(() => {
    if (!showBackup) return;
    const frame = window.requestAnimationFrame(() => {
      backupPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showBackup]);

  const filteredCheckins = useMemo(
    () => {
      const seenSlots = new Set<string>();
      return Array.from(checkins).reverse().filter((entry) => {
        const key = entry.split("::")[0];
        const courseId = entry.split("::")[1];
        const course = COURSE_BY_ID[courseId];
        const slotKey = course ? `${key}::${course.time}` : entry;
        if (key < startDate || key > endDate || seenSlots.has(slotKey)) return false;
        seenSlots.add(slotKey);
        return true;
      }).reverse();
    },
    [checkins, startDate, endDate],
  );
  const effectiveCheckins = useMemo(() => new Set(filteredCheckins), [filteredCheckins]);
  const historicalCoursesByDate = useMemo(() => {
    const grouped = new Map<string, Course[]>();
    checkins.forEach((entry) => {
      const [key, courseId] = entry.split("::");
      const course = COURSE_BY_ID[courseId];
      if (!course) return;
      grouped.set(key, [...(grouped.get(key) || []), course]);
    });
    return grouped;
  }, [checkins]);

  function coursesForDate(key: string) {
    const scheduled = scheduleForDate(key);
    const scheduledIds = new Set(scheduled.map((course) => course.id));
    const historical = (historicalCoursesByDate.get(key) || []).filter(
      (course) => !scheduledIds.has(course.id),
    );
    return [...scheduled, ...historical];
  }

  const checkinCount = filteredCheckins.length;
  const filteredRatings = filteredCheckins
    .map((entry) => ratings[entry])
    .filter((score): score is number => typeof score === "number");
  const averageRating =
    filteredRatings.length > 0
      ? filteredRatings.reduce((sum, score) => sum + score, 0) / filteredRatings.length
      : null;
  const danceIndices = filteredCheckins
    .map((entry) => {
      const courseId = entry.split("::")[1];
      const course = COURSE_BY_ID[courseId];
      const rating = ratings[entry];
      return course && typeof rating === "number" ? danceIndex(course, rating) : null;
    })
    .filter((value): value is number => typeof value === "number");
  const averageDanceIndex =
    danceIndices.length > 0
      ? danceIndices.reduce((sum, value) => sum + value, 0) / danceIndices.length
      : null;
  const analyticsRecords = useMemo(
    () => filteredCheckins.flatMap((entry) => {
      const [date, courseId] = entry.split("::");
      const course = COURSE_BY_ID[courseId];
      if (!course) return [];
      const rating = ratings[entry];
      return [{
        date,
        course,
        rating: typeof rating === "number" ? rating : null,
        power: typeof rating === "number" ? danceIndex(course, rating) : null,
      }];
    }),
    [filteredCheckins, ratings],
  );
  const styleStats = useMemo(() => {
    const groups = new Map<string, {
      name: string;
      count: number;
      ratingTotal: number;
      ratingCount: number;
      powerTotal: number;
      powerCount: number;
    }>();
    analyticsRecords.forEach((record) => {
      const name = danceCategory(record.course.style);
      const current = groups.get(name) || {
        name,
        count: 0,
        ratingTotal: 0,
        ratingCount: 0,
        powerTotal: 0,
        powerCount: 0,
      };
      current.count += 1;
      if (record.rating !== null) {
        current.ratingTotal += record.rating;
        current.ratingCount += 1;
      }
      if (record.power !== null) {
        current.powerTotal += record.power;
        current.powerCount += 1;
      }
      groups.set(name, current);
    });
    return Array.from(groups.values())
      .map((group) => ({
        name: group.name,
        count: group.count,
        averageRating: group.ratingCount > 0 ? group.ratingTotal / group.ratingCount : null,
        averagePower: group.powerCount > 0 ? group.powerTotal / group.powerCount : null,
      }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  }, [analyticsRecords]);
  const monthStats = useMemo(() => {
    const groups = new Map(monthKeysBetween(startDate, endDate).map((key) => [key, {
      key,
      count: 0,
      ratingTotal: 0,
      ratingCount: 0,
    }]));
    filteredCheckins.forEach((entry) => {
      const key = entry.slice(0, 7);
      const current = groups.get(key);
      if (!current) return;
      current.count += 1;
      const rating = ratings[entry];
      if (typeof rating === "number") {
        current.ratingTotal += rating;
        current.ratingCount += 1;
      }
    });
    return Array.from(groups.values()).map((group) => ({
      key: group.key,
      label: `${Number(group.key.slice(5, 7))}月`,
      year: group.key.slice(0, 4),
      count: group.count,
      averageRating: group.ratingCount > 0 ? group.ratingTotal / group.ratingCount : null,
    }));
  }, [filteredCheckins, ratings, startDate, endDate]);
  const linkedStyle = selectedStyle && styleStats.some((item) => item.name === selectedStyle)
    ? selectedStyle
    : null;
  const linkedRecords = linkedStyle
    ? analyticsRecords.filter((record) => danceCategory(record.course.style) === linkedStyle)
    : analyticsRecords;
  const linkedRatings = linkedStyle
    ? linkedRecords
      .map((record) => record.rating)
      .filter((score): score is number => typeof score === "number")
    : filteredRatings;
  const linkedMonthStats = linkedStyle
    ? monthStats.map((item) => {
      const records = linkedRecords.filter((record) => record.date.startsWith(item.key));
      const scores = records
        .map((record) => record.rating)
        .filter((score): score is number => typeof score === "number");
      return {
        ...item,
        count: records.length,
        averageRating: scores.length > 0
          ? scores.reduce((sum, score) => sum + score, 0) / scores.length
          : null,
      };
    })
    : monthStats;
  const linkedRecordCount = linkedStyle ? linkedRecords.length : checkinCount;
  const ratingDistribution = RATING_GUIDE.map((item) => ({
    ...item,
    count: linkedRatings.filter((score) => score === item.score).length,
  }));
  const maxMonthCount = Math.max(1, ...linkedMonthStats.map((item) => item.count));
  const maxRatingCount = Math.max(1, ...ratingDistribution.map((item) => item.count));
  const linkedActiveMonths = linkedMonthStats.filter((item) => item.count > 0).length;
  const linkedAverageRating = linkedRatings.length > 0
    ? linkedRatings.reduce((sum, score) => sum + score, 0) / linkedRatings.length
    : null;
  const peakMonth = checkinCount > 0 && monthStats.length > 0
    ? monthStats.reduce((best, item) => item.count > best.count ? item : best, monthStats[0])
    : null;
  const currentUnitPrice = checkinCount > 0 ? ANNUAL_SPEND / checkinCount : null;
  const remainingCount = Math.max(TARGET_COUNT - checkinCount, 0);
  const progress = Math.min((checkinCount / TARGET_COUNT) * 100, 100);
  const progressLabel = progress === 0 || progress >= 10 ? progress.toFixed(0) : progress.toFixed(1);
  const periodDays = inclusiveDays(startDate, endDate);
  const dailyTarget = TARGET_COUNT / periodDays;
  const weeklyTarget = dailyTarget * 7;
  const monthlyTarget = MONTHLY_TARGET;
  const todayKey = chinaDateKey();
  const elapsedPassDays = todayKey < startDate
    ? 0
    : inclusiveDays(startDate, todayKey > endDate ? endDate : todayKey);
  const remainingPassDays = Math.max(periodDays - elapsedPassDays, 0);
  const averageMonthDays = 365.2425 / 12;
  const elapsedPassMonths = elapsedPassDays / averageMonthDays;
  const totalPassMonths = periodDays / averageMonthDays;
  const timeProgress = Math.min((elapsedPassDays / periodDays) * 100, 100);
  const currentMonthKey = todayKey.slice(0, 7);
  const currentMonthPosition = linkedMonthStats.findIndex((item) => item.key === currentMonthKey);
  const latestMonthPosition = currentMonthPosition >= 0
    ? currentMonthPosition
    : Math.max(0, linkedMonthStats.length - 1);
  const monthWindowEndPosition = Math.min(
    latestMonthPosition,
    Math.max(0, latestMonthPosition + monthWindowOffset),
  );
  const visibleLinkedMonthStats = linkedMonthStats.slice(
    Math.max(0, monthWindowEndPosition - 2),
    monthWindowEndPosition + 1,
  );
  const displayedMonthStats = linkedMonthStats[monthWindowEndPosition] || null;
  const canViewPreviousMonth = monthWindowEndPosition > 0;
  const canViewNextMonth = monthWindowEndPosition < latestMonthPosition;
  const currentMonthClasses = monthStats.find((item) => item.key === currentMonthKey)?.count || 0;
  const monthlyGoalRate = monthlyTarget > 0
    ? (currentMonthClasses / monthlyTarget) * 100
    : 0;
  const displayedMonthGoalRate = displayedMonthStats && monthlyTarget > 0
    ? (displayedMonthStats.count / monthlyTarget) * 100
    : 0;

  const viewYear = Math.floor(viewMonth / 12);
  const viewMonthZero = ((viewMonth % 12) + 12) % 12;
  const calendarCells = monthCells(viewYear, viewMonthZero);
  const minMonth = monthIndex(startDate);
  const maxMonth = monthIndex(endDate);
  const weekCalendarCells = weekCells(selectedDate);
  const weekStartKey = dateKey(weekCalendarCells[0]);
  const weekEndKey = dateKey(weekCalendarCells[6]);
  const selectedDay = dateFromKey(selectedDate);
  const selectedCourses = coursesForDate(selectedDate);
  const selectedCourseSlots = groupCoursesByTime(selectedCourses);
  const selectedCompletedSlots = selectedCourseSlots.filter((slot) =>
    slot.courses.some((course) => effectiveCheckins.has(`${selectedDate}::${course.id}`)),
  ).length;
  const selectedRatings = selectedCourses
    .map((course) => {
      const recordId = `${selectedDate}::${course.id}`;
      return effectiveCheckins.has(recordId) ? ratings[recordId] : null;
    })
    .filter((score): score is number => typeof score === "number");
  const selectedAverageRating =
    selectedRatings.length > 0
      ? selectedRatings.reduce((sum, score) => sum + score, 0) / selectedRatings.length
      : null;
  const selectedDanceIndices = selectedCourses
    .map((course) => {
      const recordId = `${selectedDate}::${course.id}`;
      const rating = effectiveCheckins.has(recordId) ? ratings[recordId] : null;
      return typeof rating === "number" ? danceIndex(course, rating) : null;
    })
    .filter((value): value is number => typeof value === "number");
  const selectedAverageDanceIndex =
    selectedDanceIndices.length > 0
      ? selectedDanceIndices.reduce((sum, value) => sum + value, 0) / selectedDanceIndices.length
      : null;

  function chooseDate(key: string) {
    setSelectedDate(key);
    setViewMonth(monthIndex(key));
    setRatingCourseId(null);
  }

  function chooseCourse(key: string, courseId: string) {
    setSelectedDate(key);
    setViewMonth(monthIndex(key));
    setRatingCourseId(courseId);
  }

  function moveCalendar(direction: -1 | 1) {
    if (calendarView === "month") {
      setViewMonth((month) => month + direction);
      return;
    }
    const nextDate = clampDateKey(shiftDateKey(selectedDate, direction * 7), startDate, endDate);
    setSelectedDate(nextDate);
    setViewMonth(monthIndex(nextDate));
    setRatingCourseId(null);
  }

  function saveRating(courseId: string, score: number) {
    const id = `${selectedDate}::${courseId}`;
    const course = COURSE_BY_ID[courseId];
    if (!course) return;
    const sameSlotIds = selectedCourses
      .filter((item) => item.time === course.time)
      .map((item) => `${selectedDate}::${item.id}`);
    setCheckins((current) => {
      const next = new Set(current);
      sameSlotIds.forEach((recordId) => next.delete(recordId));
      next.add(id);
      return next;
    });
    setRatings((current) => {
      const next = { ...current };
      sameSlotIds.forEach((recordId) => delete next[recordId]);
      next[id] = score;
      return next;
    });
    setRatingCourseId(null);
  }

  function removeCheckin(courseId: string) {
    const course = COURSE_BY_ID[courseId];
    const sameSlotIds = selectedCourses
      .filter((item) => !course || item.time === course.time)
      .map((item) => `${selectedDate}::${item.id}`);
    setCheckins((current) => {
      const next = new Set(current);
      sameSlotIds.forEach((recordId) => next.delete(recordId));
      return next;
    });
    setRatings((current) => {
      const next = { ...current };
      sameSlotIds.forEach((recordId) => delete next[recordId]);
      return next;
    });
    setRatingCourseId(null);
  }

  function applyDates(nextStart: string, nextEnd: string) {
    if (!nextStart || !nextEnd || nextStart > nextEnd) return;
    setStartDate(nextStart);
    setEndDate(nextEnd);
    if (selectedDate < nextStart || selectedDate > nextEnd) {
      setSelectedDate(nextStart);
      setViewMonth(monthIndex(nextStart));
    }
  }

  function exportBackup() {
    const data: SavedState = {
      startDate,
      endDate,
      checkins: Array.from(checkins),
      ratings,
    };
    const backup: BackupFile = {
      app: BACKUP_APP_ID,
      version: 1,
      exportedAt: new Date().toISOString(),
      data,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `my-dance-diary-${chinaDateKey()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setBackupNotice({ tone: "success", text: `已导出 ${checkins.size} 条打卡记录，请妥善保存文件。` });
  }

  async function importBackup(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("备份文件不能超过 2 MB。");
      const restored = parseBackup(JSON.parse(await file.text()));
      const shouldRestore = window.confirm(
        `导入将覆盖当前浏览器中的 ${checkins.size} 条打卡记录，并恢复为备份中的 ${restored.checkins.length} 条。是否继续？`,
      );
      if (!shouldRestore) return;

      const nextSelectedDate = clampDateKey(
        shiftDateKey(chinaDateKey(), -1),
        restored.startDate,
        restored.endDate,
      );
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
      setStartDate(restored.startDate);
      setEndDate(restored.endDate);
      setCheckins(new Set(restored.checkins));
      setRatings(restored.ratings || {});
      setSelectedDate(nextSelectedDate);
      setViewMonth(monthIndex(nextSelectedDate));
      setSelectedStyle(null);
      setRatingCourseId(null);
      setBackupNotice({ tone: "success", text: `导入成功，已恢复 ${restored.checkins.length} 条打卡记录。` });
    } catch (error) {
      setBackupNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "导入失败，请选择由本页面导出的 JSON 备份。",
      });
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  function jumpToStart() {
    setSelectedDate(startDate);
    setViewMonth(monthIndex(startDate));
  }

  function jumpToEnd() {
    setSelectedDate(endDate);
    setViewMonth(monthIndex(endDate));
  }

  return (
    <main className="site-shell" data-theme="y2k">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="回到顶部">
          <span className="brand-mark">M</span>
          <span>
            <b>MY DANCE DIARY</b>
            <small>DANCE DIARY</small>
          </span>
        </a>
        <div className="topbar-meta">
          <span className="era-label">{startDate.slice(0, 4)}—{endDate.slice(0, 4)} · DANCE DIARY</span>
          <div className="topbar-actions">
            <button
              className="text-button"
              type="button"
              aria-expanded={showBackup}
              aria-controls="data-backup-panel"
              onClick={() => {
              setShowBackup((value) => !value);
              setShowSettings(false);
              }}
            >
              {showBackup ? "收起备份" : "数据备份"}
            </button>
            <button className="text-button" type="button" onClick={() => {
              setShowSettings((value) => !value);
              setShowBackup(false);
            }}>
              {showSettings ? "收起设置" : "年卡设置"}
            </button>
          </div>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="mv-label-row">
            <p className="eyebrow">MY DANCE DIARY</p>
            <span>Y2K DIARY EDITION</span>
          </div>
          <h1>
            <small>VIBE CODING · DANCE DIARY</small>
            MY DANCE
            <span>DIARY</span>
          </h1>
          <p className="hero-intro">
            记录每一次上场、放炮、SOLO 和高光共舞。
            这一年的 <strong>{TARGET_COUNT} 次练习</strong>，会慢慢组成属于你的舞台。
          </p>
          <div className="hero-dates">
            <span>{startDate.replaceAll("-", ".")}</span>
            <i aria-hidden="true" />
            <span>{endDate.replaceAll("-", ".")}</span>
          </div>
        </div>

        <div className="archive-visual" aria-hidden="true">
          <div className="archive-card archive-card-main">
            <span className="paper-tape">MY COPY</span>
            <p>CHECK-INS SAVED</p>
            <strong>{String(checkinCount).padStart(3, "0")}</strong>
            <small>EVERY CLASS BECOMES A PAGE.</small>
            <div className="sound-wave">
              <i /><i /><i /><i /><i /><i /><i /><i />
            </div>
          </div>
          <div className="archive-ticket">
            <span>ANNUAL PRACTICE PASS</span>
            <b>{startDate.slice(0, 4)} — {endDate.slice(0, 4)}</b>
            <small>MY DANCE DIARY · ADMIT ONE</small>
          </div>
          <div className="archive-disc">
            <span>MD</span>
            <small>PLAY<br />REWIND<br />GROW</small>
          </div>
          <span className="archive-star star-one">✦</span>
          <span className="archive-star star-two">★</span>
          <span className="archive-caption">NO PERFECT TAKE NEEDED</span>
        </div>

        <div className="goal-card">
          <div
            className="progress-ring"
            style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}
            aria-label={`目标进度 ${progress.toFixed(1)}%`}
          >
            <div>
              <strong>{progressLabel}%</strong>
              <span>目标完成率</span>
            </div>
          </div>
          <div className="goal-copy">
            <span>年度练习进度</span>
            <strong>{checkinCount} / {TARGET_COUNT} 节</strong>
            <small>
              {remainingCount > 0
                ? `再记录 ${remainingCount} 节，完成年度练舞目标`
                : "年度练舞目标已完成，继续为热爱发光"}
            </small>
          </div>
        </div>
      </section>

      {showSettings && (
        <section className="settings-panel" aria-label="年卡设置">
          <div>
            <p className="section-kicker">DIARY PERIOD</p>
            <h2>调整年卡有效期</h2>
            <p>默认记录周期为 {DEFAULT_START.replaceAll("-", ".")} 至 {DEFAULT_END.replaceAll("-", ".")}；每月目标 {MONTHLY_TARGET} 节、年度练舞目标 {TARGET_COUNT} 节，单节课价会随累计打卡次数自动更新。</p>
          </div>
          <div className="date-fields">
            <label>
              开始日期
              <input
                type="date"
                value={startDate}
                onChange={(event) => applyDates(event.target.value, endDate)}
              />
            </label>
            <label>
              结束日期
              <input
                type="date"
                value={endDate}
                onChange={(event) => applyDates(startDate, event.target.value)}
              />
            </label>
          </div>
        </section>
      )}

      {showBackup && (
        <section
          ref={backupPanelRef}
          id="data-backup-panel"
          className="settings-panel backup-panel"
          aria-label="数据备份"
        >
          <div>
            <p className="section-kicker">DATA BACKUP</p>
            <h2>带走你的练舞日记</h2>
            <p>导出会保存有效期、打卡和评分；导入会覆盖当前浏览器中的记录，课表不会改变。</p>
          </div>
          <div className="backup-controls">
            <div className="backup-actions">
              <button type="button" className="backup-button primary" onClick={exportBackup} disabled={!loaded}>
                <span>导出数据</span>
                <small>下载 JSON 备份</small>
              </button>
              <button type="button" className="backup-button" onClick={() => importInputRef.current?.click()} disabled={!loaded}>
                <span>导入数据</span>
                <small>恢复已有备份</small>
              </button>
              <input
                ref={importInputRef}
                className="backup-file-input"
                type="file"
                accept=".json,application/json"
                aria-label="选择练舞日记备份文件"
                onChange={(event) => void importBackup(event.target.files?.[0])}
              />
            </div>
            {backupNotice && (
              <p className={`backup-notice ${backupNotice.tone}`} role={backupNotice.tone === "error" ? "alert" : "status"}>
                {backupNotice.text}
              </p>
            )}
          </div>
        </section>
      )}

      <section className="stats-grid" aria-label="打卡数据">
        <article data-track="DIARY 01">
          <span>已收录课次</span>
          <strong>{checkinCount}<em>节</em></strong>
          <small>完成 {progress.toFixed(1)}%</small>
        </article>
        <article data-track="DIARY 02">
          <span>待收录</span>
          <strong>{remainingCount}<em>节</em></strong>
          <small>完成年度练舞目标</small>
        </article>
        <article data-track="WEEKLY RHYTHM">
          <span>每周节奏</span>
          <strong>{weeklyTarget.toFixed(1)}<em>节</em></strong>
          <small>平均每天 {dailyTarget.toFixed(2)} 节</small>
        </article>
        <article className="accent-stat" data-track="DANCE INDEX">
          <span>平均舞力指数</span>
          <strong>{averageDanceIndex === null ? "—" : averageDanceIndex.toFixed(1)}<em>/ 20</em></strong>
          <small>课程挑战度 × 当次自评分</small>
        </article>
        <article className="score-stat" data-track="SELF REVIEW">
          <span>平均自评分</span>
          <strong>{averageRating === null ? "—" : averageRating.toFixed(1)}<em>/ 5</em></strong>
          <small>{filteredRatings.length > 0 ? `来自 ${filteredRatings.length} 次课后评分` : "第一次打卡后开始记录"}</small>
        </article>
      </section>

      <section className="calendar-section">
        <div className="section-heading">
          <div>
            <p className="section-kicker">DANCE DIARY · CHECK-IN CALENDAR</p>
            <h2>我的练舞日历</h2>
          </div>
          <p>月视图看练舞节奏 · 周视图按时间段展开课程 · 点击课程即可评分打卡</p>
        </div>

        <div className="calendar-layout">
          <div className="calendar-card">
            <div className="calendar-toolbar">
              <button
                type="button"
                className="icon-button"
                aria-label={calendarView === "month" ? "上一个月" : "上一周"}
                disabled={calendarView === "month" ? viewMonth <= minMonth : selectedDate <= startDate}
                onClick={() => moveCalendar(-1)}
              >
                ←
              </button>
              <h3>
                {calendarView === "month"
                  ? `${viewYear} 年 ${viewMonthZero + 1} 月`
                  : `${weekStartKey.replaceAll("-", ".")} — ${weekEndKey.replaceAll("-", ".")}`}
              </h3>
              <div className="month-shortcuts">
                <span className="calendar-view-switch" aria-label="日历视图切换">
                  <button
                    type="button"
                    className={calendarView === "month" ? "active" : ""}
                    aria-pressed={calendarView === "month"}
                    onClick={() => setCalendarView("month")}
                  >
                    月视图
                  </button>
                  <button
                    type="button"
                    className={calendarView === "week" ? "active" : ""}
                    aria-pressed={calendarView === "week"}
                    onClick={() => setCalendarView("week")}
                  >
                    周视图
                  </button>
                </span>
                <button type="button" onClick={jumpToStart}>开卡月</button>
                <button type="button" onClick={jumpToEnd}>结束月</button>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={calendarView === "month" ? "下一个月" : "下一周"}
                disabled={calendarView === "month" ? viewMonth >= maxMonth : selectedDate >= endDate}
                onClick={() => moveCalendar(1)}
              >
                →
              </button>
            </div>

            <div className="difficulty-legend" aria-label="课程难度与舞力指数图例">
              <b>课程挑战度</b>
              {DIFFICULTY_ORDER.map((level) => (
                <span className={`level-tag ${DIFFICULTY_META[level].className}`} key={level}>
                  D{DIFFICULTY_VALUE[level]} · {level}
                </span>
              ))}
              <span className="index-formula">D1–D4 × 自评分 S1–S5 = 舞力 /20</span>
            </div>

            <div className="attendance-legend" aria-label="上课状态图例">
              <b>上课状态</b>
              <span><i className="legend-attended">✓</i> 已上课</span>
              <span><i className="legend-missed">—</i> 未上课</span>
              <span><i className="legend-today">●</i> 今天待打卡</span>
              <span><i className="legend-upcoming">○</i> 未来待安排</span>
            </div>

            {calendarView === "month" ? (
              <>
                <div className="weekday-row" aria-hidden="true">
                  {WEEKDAYS.map((weekday) => <span key={weekday}>周{weekday}</span>)}
                </div>

                <div className="calendar-grid" role="grid" aria-label={`${viewYear}年${viewMonthZero + 1}月课程日历`}>
              {calendarCells.map((date) => {
                const key = dateKey(date);
                const inMonth = date.getMonth() === viewMonthZero;
                const active = key >= startDate && key <= endDate;
                const courses = coursesForDate(key);
                const courseSlots = groupCoursesByTime(courses);
                const courseLevels = DIFFICULTY_ORDER.filter((level) =>
                  courses.some((course) => course.level === level),
                );
                const dayCompletedSlots = courseSlots.filter((slot) =>
                  slot.courses.some((course) => effectiveCheckins.has(`${key}::${course.id}`)),
                ).length;
                const dayDanceIndices = courses
                  .map((course) => {
                    const recordId = `${key}::${course.id}`;
                    const rating = effectiveCheckins.has(recordId) ? ratings[recordId] : null;
                    return typeof rating === "number" ? danceIndex(course, rating) : null;
                  })
                  .filter((value): value is number => typeof value === "number");
                const dayDanceAverage =
                  dayDanceIndices.length > 0
                    ? dayDanceIndices.reduce((sum, value) => sum + value, 0) / dayDanceIndices.length
                    : null;
                const isSelected = key === selectedDate;
                const isStart = key === startDate;
                const isEnd = key === endDate;
                const attendanceClass = !active
                  ? ""
                  : dayCompletedSlots > 0
                    ? "attendance-attended"
                    : key === todayKey
                      ? "attendance-today"
                      : key < todayKey
                        ? "attendance-missed"
                        : "attendance-upcoming";
                const attendanceLabel = dayCompletedSlots > 0
                  ? `✓ 已上 ${dayCompletedSlots}/${courseSlots.length} 时段`
                  : key === todayKey
                    ? "今天 · 待打卡"
                    : key < todayKey
                      ? "— 未上课"
                      : "待安排";

                return (
                  <button
                    className={`day-cell ${inMonth ? "" : "outside"} ${active ? "" : "inactive"} ${isSelected ? "selected" : ""} ${attendanceClass}`}
                    type="button"
                    key={key}
                    disabled={!active}
                    onClick={() => chooseDate(key)}
                    aria-label={`${formatChineseDate(key)}，${courseSlots.length}个课程时段，${attendanceLabel}，难度${courseLevels.join("、")}${dayDanceAverage === null ? "" : `，平均舞力${dayDanceAverage.toFixed(1)}`}`}
                    aria-pressed={isSelected}
                  >
                    <span className="day-topline">
                      <span className="day-number">
                        {date.getDate()}
                        {isStart && <b>开卡</b>}
                        {isEnd && <b>结束</b>}
                      </span>
                      <span className="day-class-count">{courseSlots.length} SLOTS</span>
                    </span>
                    <span className="day-slot-list" aria-hidden="true">
                      {courseSlots.map((slot) => {
                        const checkedCourse = slot.courses.find((course) =>
                          effectiveCheckins.has(`${key}::${course.id}`),
                        );
                        return (
                          <span
                            className={`day-slot ${checkedCourse ? "completed" : ""}`}
                            key={slot.time}
                          >
                            <b>{slot.time.split("–")[0]}</b>
                            <i>{checkedCourse ? "✓" : summarizeDifficulty(slot.courses)}</i>
                          </span>
                        );
                      })}
                    </span>
                    <span className="day-meta">
                      <small className="day-attendance-label">{attendanceLabel}</small>
                      {dayDanceAverage !== null && (
                        <strong>舞力 {dayDanceAverage.toFixed(1)}</strong>
                      )}
                    </span>
                    <span className="sr-only">
                      {courseLevels.map((level) => (
                        <span key={level}>
                          D{DIFFICULTY_VALUE[level]} {level}
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
                </div>
              </>
            ) : (
              <div className="week-view-scroll">
                <div className="week-grid" role="grid" aria-label={`${weekStartKey}至${weekEndKey}课程周视图`}>
                  {weekCalendarCells.map((date) => {
                    const key = dateKey(date);
                    const active = key >= startDate && key <= endDate;
                    const courses = coursesForDate(key);
                    const courseSlots = groupCoursesByTime(courses);
                    const completedSlots = courseSlots.filter((slot) =>
                      slot.courses.some((course) => effectiveCheckins.has(`${key}::${course.id}`)),
                    ).length;
                    const dayDanceIndices = courses
                      .map((course) => {
                        const recordId = `${key}::${course.id}`;
                        const rating = effectiveCheckins.has(recordId) ? ratings[recordId] : null;
                        return typeof rating === "number" ? danceIndex(course, rating) : null;
                      })
                      .filter((value): value is number => typeof value === "number");
                    const dayDanceAverage =
                      dayDanceIndices.length > 0
                        ? dayDanceIndices.reduce((sum, value) => sum + value, 0) / dayDanceIndices.length
                        : null;
                    const attendanceClass = !active
                      ? "inactive"
                      : completedSlots > 0
                        ? "attendance-attended"
                        : key === todayKey
                          ? "attendance-today"
                          : key < todayKey
                            ? "attendance-missed"
                            : "attendance-upcoming";
                    const attendanceLabel = completedSlots > 0
                      ? `✓ 已上 ${completedSlots}/${courseSlots.length}`
                      : key === todayKey
                        ? "今天待打卡"
                        : key < todayKey
                          ? "未上课"
                          : "待安排";
                    const isSelected = key === selectedDate;

                    return (
                      <article className={`week-day ${attendanceClass} ${isSelected ? "selected" : ""}`} key={key}>
                        <button
                          type="button"
                          className="week-day-head"
                          disabled={!active}
                          onClick={() => chooseDate(key)}
                          aria-pressed={isSelected}
                        >
                          <span>
                            <small>周{WEEKDAYS[date.getDay()]}</small>
                            <b>{date.getMonth() + 1}.{date.getDate()}</b>
                          </span>
                          <span className="week-head-metrics">
                            <i>{attendanceLabel}</i>
                            {dayDanceAverage !== null && (
                              <strong>舞力 {dayDanceAverage.toFixed(1)}</strong>
                            )}
                          </span>
                        </button>
                        <div className="week-day-slots">
                          {courseSlots.map((slot) => (
                            <section className="week-time-slot" key={slot.time}>
                              <header>
                                <b>{slot.time}</b>
                                <span>{summarizeDifficulty(slot.courses)}</span>
                              </header>
                              <div className="week-course-options">
                                {slot.courses.map((course) => {
                                  const recordId = `${key}::${course.id}`;
                                  const checked = effectiveCheckins.has(recordId);
                                  const rating = checked ? ratings[recordId] : null;
                                  const courseDanceIndex =
                                    typeof rating === "number" ? danceIndex(course, rating) : null;
                                  return (
                                    <button
                                      type="button"
                                      className={`week-course-tab ${checked ? "checked" : ""}`}
                                      key={course.id}
                                      disabled={!active}
                                      onClick={() => chooseCourse(key, course.id)}
                                      aria-pressed={checked}
                                      aria-label={`${formatChineseDate(key)} ${slot.time} ${course.style} ${course.teacher} D${DIFFICULTY_VALUE[course.level]}${checked ? "，已打卡" : ""}${courseDanceIndex === null ? "" : `，舞力${courseDanceIndex}`}`}
                                    >
                                      <span>
                                        <strong>{course.style}</strong>
                                        <small>{course.teacher}</small>
                                      </span>
                                      <i>
                                        <span>D{DIFFICULTY_VALUE[course.level]}{courseDanceIndex !== null ? ` × S${rating}` : ""}</span>
                                        {courseDanceIndex !== null && <b>舞力 {courseDanceIndex}</b>}
                                      </i>
                                    </button>
                                  );
                                })}
                              </div>
                            </section>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <aside className="day-panel" aria-label="所选日期课程">
            <div className="day-panel-head">
              <div>
                <span>{selectedDate.split("-")[0]}</span>
                <strong>{String(selectedDay.getDate()).padStart(2, "0")}</strong>
              </div>
              <div>
                <p>{formatChineseDate(selectedDate)}</p>
                <h3>今天想跳哪一节？</h3>
                <small>
                  {selectedCourseSlots.length} 个时段 · {selectedCourses.length} 门课可选 · 已上 {selectedCompletedSlots} 个
                  {selectedAverageRating !== null && ` · 均分 ${selectedAverageRating.toFixed(1)}`}
                  {selectedAverageDanceIndex !== null && ` · 舞力 ${selectedAverageDanceIndex.toFixed(1)}/20`}
                </small>
              </div>
            </div>

            <p className="dance-index-note">
              <b>按时间段选课</b>
              每个时间段记录 1 节；同场课程用 Tab 并排展示，改选时自动替换。舞力 = D × S，满分 20。
            </p>

            <div className="course-list">
              {selectedCourseSlots.map((slot) => {
                const checkedCourse = slot.courses.find((course) =>
                  effectiveCheckins.has(`${selectedDate}::${course.id}`),
                );
                return (
                  <section className={`time-slot-group ${checkedCourse ? "has-checkin" : ""}`} key={slot.time}>
                    <header className="time-slot-head">
                      <span>
                        <b>{slot.time}</b>
                        <small>{slot.courses.length} 门可选 · {summarizeDifficulty(slot.courses)}</small>
                      </span>
                      <strong>{checkedCourse ? `✓ 已选 ${checkedCourse.style} · ${checkedCourse.teacher}` : "本时段未打卡"}</strong>
                    </header>
                    <div className="time-slot-courses">
                      {slot.courses.map((course) => {
                        const recordId = `${selectedDate}::${course.id}`;
                        const checked = effectiveCheckins.has(recordId);
                        const slotTaken = Boolean(checkedCourse && !checked);
                        const rating = checked ? ratings[recordId] : undefined;
                        const ratingOpen = ratingCourseId === course.id;
                        return (
                          <article className={`course-item ${checked ? "checked" : ""} ${slotTaken ? "slot-taken" : ""} ${ratingOpen ? "rating-open" : ""}`} key={course.id}>
                            <div className="course-row">
                              <span className="course-check" aria-hidden="true">{checked ? "✓" : slotTaken ? "↺" : "+"}</span>
                              <span className="course-main">
                                <strong>{course.style}</strong>
                                <small>
                                  <span>{course.teacher}</span>
                                  <i className={`level-tag ${DIFFICULTY_META[course.level].className}`}>
                                    D{DIFFICULTY_VALUE[course.level]} · {course.level}
                                  </i>
                                </small>
                              </span>
                              <span className="course-actions">
                                <button
                                  type="button"
                                  className="score-trigger"
                                  onClick={() => setRatingCourseId(ratingOpen ? null : course.id)}
                                  aria-expanded={ratingOpen}
                                >
                                  {checked ? (rating ? `${rating} 分 · 改分` : "补评分") : slotTaken ? "改选这一节" : "打卡并评分"}
                                </button>
                                {checked && rating && (
                                  <span className="course-index">
                                    D{DIFFICULTY_VALUE[course.level]} × S{rating} = {danceIndex(course, rating)}/20
                                  </span>
                                )}
                                {checked && (
                                  <button
                                    type="button"
                                    className="remove-checkin"
                                    onClick={() => removeCheckin(course.id)}
                                    aria-label={`取消 ${slot.time} 的 ${course.style} 课程打卡`}
                                  >
                                    取消本时段
                                  </button>
                                )}
                              </span>
                            </div>

                            {ratingOpen && (
                              <div className="rating-picker" aria-label={`${course.style} 课后自评分`}>
                                <p>
                                  <strong>{rating ? "修改这节课的评分" : slotTaken ? "改选这节课并评分" : "先给今天的自己打个分"}</strong>
                                  <span>{slotTaken ? "选定分数后，将替换本时段原来的课程" : "选定分数后自动完成打卡"}</span>
                                </p>
                                <div className="rating-options">
                                  {RATING_GUIDE.map((item) => (
                                    <button
                                      type="button"
                                      className={rating === item.score ? "selected" : ""}
                                      key={item.score}
                                      onClick={() => saveRating(course.id, item.score)}
                                      aria-label={`${item.score}分，${item.label}：${item.detail}`}
                                    >
                                      <b>{item.score}</b>
                                      <span>
                                        <strong>{item.label}</strong>
                                        <small>{item.detail}</small>
                                      </span>
                                      <em>舞力 {danceIndex(course, item.score)}/20</em>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            <details className="rating-guide">
              <summary>查看 1–5 分打分标准</summary>
              <ol>
                {RATING_GUIDE.map((item) => (
                  <li key={item.score}>
                    <b>{item.score} 分 · {item.label}</b>
                    <span>{item.detail}</span>
                  </li>
                ))}
              </ol>
            </details>

            <p className="storage-note">
              打卡与评分仅保存在当前设备的浏览器中；清理浏览器数据后会丢失，手机与电脑不会自动同步。
            </p>
          </aside>
        </div>
      </section>

      <section className="analytics-section" aria-label="练舞数据看板">
        <div className="section-heading">
          <div>
            <p className="section-kicker">DANCE DATA · PRACTICE PORTRAIT</p>
            <h2>我的练舞数据看板</h2>
          </div>
          <p>按舞种看偏好 · 按月份看节奏 · 用目标达成率校准练习进度</p>
        </div>

        <article className="dance-mix-card">
          <header className="dance-mix-header">
            <span>
              <small>DANCE MIX · SIDE A</small>
              <strong>舞种练习歌单</strong>
            </span>
            <p>{linkedStyle ? `${linkedStyle} 正在播放` : "点击舞种，联动查看评分与月度节奏"}</p>
          </header>

          {styleStats.length > 0 ? (
            <div className="dance-mix-board">
              <div className={`dance-mix-list ${linkedStyle ? "has-selection" : ""}`}>
                {styleStats.map((item, index) => (
                  <button
                    type="button"
                    className={`dance-mix-row ${linkedStyle === item.name ? "selected" : ""}`}
                    key={item.name}
                    onClick={() => setSelectedStyle((current) => current === item.name ? null : item.name)}
                    aria-pressed={linkedStyle === item.name}
                    aria-label={`${item.name}，${item.count}节，平均评分${item.averageRating?.toFixed(1) || "暂无"}，平均舞力${item.averagePower?.toFixed(1) || "暂无"}`}
                  >
                    <span className="dance-mix-rank">{String(index + 1).padStart(2, "0")}</span>
                    <span className="dance-mix-name"><strong>{item.name}</strong><small>STYLE TRACK</small></span>
                    <span className="dance-mix-metric"><small>均分</small><strong>{item.averageRating === null ? "—" : `S${item.averageRating.toFixed(1)}`}</strong></span>
                    <span className="dance-mix-metric"><small>课次</small><strong>{item.count}<em>节</em></strong></span>
                    <span className="dance-mix-metric"><small>舞力</small><strong>{item.averagePower === null ? "—" : item.averagePower.toFixed(1)}</strong></span>
                    <span className="dance-mix-meter" aria-hidden="true"><i style={{ width: `${((item.averageRating || 0) / 5) * 100}%` }} /></span>
                    <span className="dance-mix-arrow" aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>

              <div className="dance-mix-detail">
                <header className="dance-mix-detail-header">
                  <span><small>NOW PLAYING</small><strong>{linkedStyle || "全部舞种"}</strong></span>
                  {linkedStyle ? (
                    <button className="chart-filter-reset" type="button" onClick={() => setSelectedStyle(null)}>返回全部 ×</button>
                  ) : (
                    <i>{linkedRecordCount} 节已收录</i>
                  )}
                </header>

                <div className="dance-mix-insights">
                  <section className="mix-rating-panel" aria-label={`${linkedStyle || "全部舞种"}评分分布`}>
                    <header><strong>评分状态</strong><small>{linkedRatings.length} REVIEWS</small></header>
                    <div className="mix-rating-list">
                      {ratingDistribution.map((item) => (
                        <div className="mix-rating-row" key={item.score}>
                          <span><b>S{item.score}</b><small>{item.label}</small></span>
                          <span className="mix-rating-track" aria-hidden="true"><i style={{ width: `${(item.count / maxRatingCount) * 100}%` }} /></span>
                          <strong>{item.count}</strong>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="mix-month-panel" aria-label={`${linkedStyle || "全部舞种"}月度节奏`}>
                    <header>
                      <span><strong>近月节奏</strong><small>{linkedActiveMonths} ACTIVE MONTHS</small></span>
                      <div className="mix-month-header-tools">
                        <i>{peakMonth ? `最勤 ${peakMonth.year}.${peakMonth.label.replace("月", "")}` : "等待记录"}</i>
                        <div className="mix-month-nav" aria-label="切换月度节奏">
                          <button
                            type="button"
                            aria-label="查看上个月"
                            disabled={!canViewPreviousMonth}
                            onClick={() => setMonthWindowOffset((offset) => offset - 1)}
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            aria-label="查看下个月"
                            disabled={!canViewNextMonth}
                            onClick={() => setMonthWindowOffset((offset) => Math.min(0, offset + 1))}
                          >
                            →
                          </button>
                        </div>
                      </div>
                    </header>
                    <div className="mix-month-content">
                      <div className="mix-month-bars">
                        {visibleLinkedMonthStats.map((item) => (
                          <div className={`mix-month-column ${item.key === currentMonthKey ? "current" : ""} ${item.key === displayedMonthStats?.key ? "selected" : ""}`} key={item.key}>
                            <small>{item.year}.{item.label.replace("月", "")}</small>
                            <span className="mix-month-plot">
                              <i style={{ height: `${(item.count / maxMonthCount) * 100}%` }}><b>{item.count}</b></i>
                            </span>
                            <strong>{item.averageRating === null ? "S—" : `S${item.averageRating.toFixed(1)}`}</strong>
                          </div>
                        ))}
                      </div>
                      <aside className="mix-month-summary">
                        <small>{linkedStyle ? "STYLE TOTAL" : monthWindowOffset === 0 ? "本月达成" : `${displayedMonthStats?.year}.${displayedMonthStats?.label.replace("月", "")} 达成`}</small>
                        <strong>{linkedStyle ? linkedRecords.length : displayedMonthGoalRate.toFixed(0)}<em>{linkedStyle ? "节" : "%"}</em></strong>
                        <span>{linkedStyle ? `平均评分 ${linkedAverageRating === null ? "—" : `S${linkedAverageRating.toFixed(1)}`}` : `${displayedMonthStats?.count || 0} / ${monthlyTarget} 节`}</span>
                      </aside>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          ) : (
            <p className="chart-empty">完成第一次评分打卡后，这里会生成你的舞种练习歌单。</p>
          )}
        </article>
      </section>

      <section className="value-ledger" aria-label="练舞节奏记录">
        <div>
          <p className="section-kicker">PRACTICE PULSE</p>
          <h2>我的练舞节奏</h2>
          <p>每次打卡后，单节课价会根据累计课次自动更新。</p>
        </div>
        <div className="ledger-metrics">
          <span>
            <small>当前单节课价</small>
            <strong>{currentUnitPrice === null ? "等待第一次打卡" : `¥${currentUnitPrice.toFixed(2)}`}</strong>
          </span>
          <span>
            <small>已完成</small>
            <strong>{checkinCount} 节</strong>
          </span>
          <span>
            <small>已使用卡期</small>
            <strong>{elapsedPassMonths.toFixed(1)} 个月</strong>
          </span>
          <span>
            <small>年度目标</small>
            <strong>{TARGET_COUNT} 节</strong>
          </span>
        </div>
        <div className="ledger-progress-group">
          <div className="ledger-progress-item">
            <div className="ledger-progress-label">
              <span>课次进度</span>
              <b>{checkinCount} / {TARGET_COUNT} 节 · {progress.toFixed(0)}%</b>
            </div>
            <div className="ledger-progress">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="ledger-progress-item">
            <div className="ledger-progress-label">
              <span>时间进度</span>
              <b>已用 {elapsedPassDays} / {periodDays} 天 · 剩余 {remainingPassDays} 天 · {timeProgress.toFixed(0)}%</b>
            </div>
            <div className="ledger-progress time-progress">
              <span style={{ width: `${timeProgress}%` }} />
            </div>
          </div>
        </div>
        <p className="ledger-formula">
          {currentUnitPrice === null
            ? `卡期已使用 ${elapsedPassMonths.toFixed(1)} / ${totalPassMonths.toFixed(1)} 个月 · 完成第一次打卡后显示实时单节课价`
            : `卡期已使用 ${elapsedPassMonths.toFixed(1)} / ${totalPassMonths.toFixed(1)} 个月 · 已记录 ${checkinCount} 节 · 当前单节课价 ¥${currentUnitPrice.toFixed(2)}`}
        </p>
      </section>

      <section className="archive-ending">
        <div className="section-heading">
          <div>
            <p className="section-kicker">THE NEXT PAGE</p>
            <h2>继续收录高光</h2>
          </div>
          <p>不需要完美的一遍，只需要下一次继续出现。</p>
        </div>

        <div className="milestone-track archive-track">
          {[
            { count: 1, label: "第一张记录" },
            { count: Math.max(2, Math.round(TARGET_COUNT * 0.25)), label: "稳定出现" },
            { count: Math.max(3, Math.round(TARGET_COUNT * 0.5)), label: "动作成章" },
            { count: Math.max(4, Math.round(TARGET_COUNT * 0.75)), label: "舞台在场" },
            { count: TARGET_COUNT, label: "年度目标完成" },
          ].map((milestone) => {
            const reached = checkinCount >= milestone.count;
            return (
              <article className={reached ? "reached" : ""} key={milestone.count}>
                <span>{reached ? "✓" : milestone.count}</span>
                <b>第 {milestone.count} 节</b>
                <strong>{milestone.label}</strong>
              </article>
            );
          })}
        </div>
      </section>

      <footer>
        <div className="footer-seven">P</div>
        <div>
          <strong>MY DANCE DIARY · 把喜欢的事写进一整年的日记。</strong>
          <p>课程依据你提供的日常班课表录入；节假日、调课与临时停课请以舞室通知为准。</p>
        </div>
      </footer>
    </main>
  );
}
