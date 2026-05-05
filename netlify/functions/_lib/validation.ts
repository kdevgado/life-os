import { defaultPlannerState } from "../../../src/data/defaults";
import { normalizePlannerState } from "../../../src/lib/plannerNormalize";
import type { PlannerState } from "../../../src/types/planner";
import type {
  Task,
  TaskPriority,
  TaskRepeatRule,
  TaskStatus,
} from "../../../src/types/task";
import {
  asBoolean,
  asFiniteNumber,
  asNonNegativeNumber,
  asOptionalString,
  asString,
  asStringArray,
  clampInteger,
  ensureRecord,
  generateId,
  HttpError,
  normalizeIsoTimestamp,
} from "./backend";

type NoteTab = {
  id: string;
  title: string;
  content: string;
};

export type NotesResource = {
  notes: NoteTab[];
  activeId: string;
};

export type CalendarProvider = "google" | "outlook" | "local";
export type CalendarTaskStatus = "todo" | "doing" | "done";

export type DayCalendarEvent = {
  id: string;
  title: string;
  startHour: number;
  startMinute?: 0 | 15 | 30 | 45;
  durationHours?: number;
  sourceTaskId?: string;
  sourceTaskStatus?: CalendarTaskStatus;
  provider?: CalendarProvider;
};

export function validateTasksResource(raw: unknown): Task[] {
  if (!Array.isArray(raw)) {
    throw new HttpError(400, "invalid_tasks_payload", "Tasks payload must be an array");
  }

  return raw.map((item) => normalizeTask(item));
}

export function normalizeTasksResource(raw: unknown): Task[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => normalizeTask(item));
}

export function validateNotesResource(raw: unknown): NotesResource {
  const record = ensureRecord(raw, "invalid_notes_payload", "Notes payload must be an object");
  return normalizeNotesRecord(record);
}

export function normalizeNotesResource(raw: unknown): NotesResource {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { notes: [], activeId: "" };
  }

  return normalizeNotesRecord(raw as Record<string, unknown>);
}

export function validateCalendarResource(raw: unknown): Record<string, DayCalendarEvent[]> {
  const record = ensureRecord(raw, "invalid_calendar_payload", "Calendar payload must be an object");
  return normalizeCalendarRecord(record);
}

export function normalizeCalendarResource(raw: unknown): Record<string, DayCalendarEvent[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return normalizeCalendarRecord(raw as Record<string, unknown>);
}

export function validatePlannerResource(raw: unknown): PlannerState {
  const record = ensureRecord(raw, "invalid_planner_payload", "Planner payload must be an object");
  return sanitizePlannerState(record);
}

export function normalizePlannerResource(raw: unknown): PlannerState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return sanitizePlannerState(defaultPlannerState);
  }

  return sanitizePlannerState(raw as Record<string, unknown>);
}

function normalizeTask(raw: unknown): Task {
  const record =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const now = new Date().toISOString();
  const status = normalizeTaskStatus(record.status);
  const priority = normalizeTaskPriority(record.priority);

  return {
    id: asString(record.id, generateId("task")),
    title: asString(record.title, ""),
    notes: asOptionalString(record.notes),
    status,
    priority,
    dueDate: normalizeOptionalDate(record.dueDate),
    projectId: normalizeProjectId(record.projectId),
    createdAt: normalizeIsoTimestamp(record.createdAt, now),
    updatedAt: normalizeIsoTimestamp(record.updatedAt, now),
    list: asOptionalString(record.list),
    tags: asStringArray(record.tags),
    important: asBoolean(record.important, false),
    focus: asBoolean(record.focus, false),
    myDay: normalizeOptionalMyDay(record.myDay),
    plannedFor: normalizeOptionalDateTime(record.plannedFor),
    plannedStart: normalizeOptionalDateTime(record.plannedStart),
    plannedEnd: normalizeOptionalDateTime(record.plannedEnd),
    reminderAt: normalizeOptionalDateTime(record.reminderAt),
    repeatRule: normalizeTaskRepeatRule(record.repeatRule),
    sortOrder: Number.isFinite(asFiniteNumber(record.sortOrder, Number.NaN))
      ? asFiniteNumber(record.sortOrder, 0)
      : undefined,
  };
}

function normalizeNotesRecord(record: Record<string, unknown>): NotesResource {
  const rawNotes = Array.isArray(record.notes) ? record.notes : [];
  const notes = rawNotes.map((entry, index) => {
    const item =
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : {};

    return {
      id: asString(item.id, generateId("note")),
      title: asString(item.title, `Note ${index + 1}`),
      content: asString(item.content, "<p></p>"),
    };
  });

  const requestedActiveId = asString(record.activeId, "");
  const activeId =
    notes.find((note) => note.id === requestedActiveId)?.id ??
    notes[0]?.id ??
    "";

  return { notes, activeId };
}

function normalizeCalendarRecord(record: Record<string, unknown>): Record<string, DayCalendarEvent[]> {
  const result: Record<string, DayCalendarEvent[]> = {};

  for (const [dateKey, value] of Object.entries(record)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
    if (!Array.isArray(value)) continue;

    result[dateKey] = value
      .map((entry) => normalizeCalendarEvent(entry))
      .sort((a, b) => {
        const aValue = a.startHour * 60 + (a.startMinute ?? 0);
        const bValue = b.startHour * 60 + (b.startMinute ?? 0);
        return aValue - bValue;
      });
  }

  return result;
}

function normalizeCalendarEvent(raw: unknown): DayCalendarEvent {
  const record =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const minute = normalizeQuarterMinute(record.startMinute);
  const durationHours = normalizeDurationHours(record.durationHours);
  const sourceTaskStatus = normalizeTaskStatus(record.sourceTaskStatus);
  const provider = normalizeProvider(record.provider);

  return {
    id: asString(record.id, generateId("event")),
    title: asString(record.title, "New event"),
    startHour: clampInteger(record.startHour, 0, 23, 0),
    startMinute: minute,
    durationHours,
    sourceTaskId: asOptionalString(record.sourceTaskId),
    sourceTaskStatus: record.sourceTaskId ? sourceTaskStatus : undefined,
    provider,
  };
}

function sanitizePlannerState(raw: unknown): PlannerState {
  const normalized = normalizePlannerState(raw, defaultPlannerState);

  return {
    payCycle: normalizePayCycle(normalized.payCycle),
    incomeAfterTaxMonthly: asNonNegativeNumber(normalized.incomeAfterTaxMonthly, 0),
    budgetLines: Array.isArray(normalized.budgetLines)
      ? normalized.budgetLines.map((line: PlannerState["budgetLines"][number]) => ({
          id: asString(line.id, generateId("budget")),
          name: asString(line.name, "Untitled"),
          type: line.type === "savings" ? "savings" : "expense",
          amount: asNonNegativeNumber(line.amount, 0),
          cadence: normalizeCadence(line.cadence),
        }))
      : [],
    goals: Array.isArray(normalized.goals)
      ? normalized.goals.map((goal: PlannerState["goals"][number]) => ({
          id: asString(goal.id, generateId("goal")),
          title: asString(goal.title, "Untitled goal"),
          type: normalizeGoalType(goal.type),
          targetAmount: asNonNegativeNumber(goal.targetAmount, 0),
          currentAmount: asNonNegativeNumber(goal.currentAmount, 0),
          dueDate: normalizeOptionalDate(goal.dueDate),
          fundingMode: goal.fundingMode === "manual" ? "manual" : "budgetLines",
          budgetLineIds: asStringArray(goal.budgetLineIds),
          manualContributionMonthly: asNonNegativeNumber(goal.manualContributionMonthly, 0),
        }))
      : [],
    notes: asString(normalized.notes, ""),
    fhss: {
      enabled: !!normalized.fhss?.enabled,
      salarySacrificeMonthly: asNonNegativeNumber(normalized.fhss?.salarySacrificeMonthly, 0),
      personalContribMonthly: asNonNegativeNumber(normalized.fhss?.personalContribMonthly, 0),
      eligibleCapPerFY: asNonNegativeNumber(normalized.fhss?.eligibleCapPerFY, 15000),
      financialYearStartMonth: clampInteger(normalized.fhss?.financialYearStartMonth, 0, 11, 6),
      estEligibleThisFY: asNonNegativeNumber(normalized.fhss?.estEligibleThisFY, 0),
    },
  };
}

function normalizeTaskStatus(value: unknown): TaskStatus {
  return value === "doing" || value === "done" ? value : "todo";
}

function normalizeTaskPriority(value: unknown): TaskPriority {
  return value === 1 || value === 2 ? value : 3;
}

function normalizeQuarterMinute(value: unknown): 0 | 15 | 30 | 45 {
  const parsed = clampInteger(value, 0, 59, 0);
  if (parsed < 15) return 0;
  if (parsed < 30) return 15;
  if (parsed < 45) return 30;
  return 45;
}

function normalizeDurationHours(value: unknown): number {
  const raw = asNonNegativeNumber(value, 0.5);
  const stepped = Math.round(Math.max(0.25, raw) * 4) / 4;
  return Math.min(24, stepped);
}

function normalizeProvider(value: unknown): CalendarProvider {
  return value === "google" || value === "outlook" ? value : "local";
}

function normalizePayCycle(value: unknown): PlannerState["payCycle"] {
  return value === "weekly" || value === "fortnightly" ? value : "monthly";
}

function normalizeCadence(value: unknown): "weekly" | "fortnightly" | "monthly" | "yearly" {
  return value === "weekly" || value === "fortnightly" || value === "yearly"
    ? value
    : "monthly";
}

function normalizeGoalType(value: unknown): "deposit" | "emergency" | "car" | "custom" {
  return value === "deposit" || value === "emergency" || value === "car"
    ? value
    : "custom";
}

function normalizeOptionalDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function normalizeOptionalDateTime(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeOptionalMyDay(value: unknown): string | undefined {
  if (value === "") return "";
  return normalizeOptionalDate(value);
}

function normalizeTaskRepeatRule(value: unknown): TaskRepeatRule | undefined {
  return value === "daily" ||
    value === "weekdays" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "yearly" ||
    value === "custom"
    ? value
    : undefined;
}

function normalizeProjectId(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}
