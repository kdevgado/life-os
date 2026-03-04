import type { Goal, PlannerState } from "../types/planner";
import { toMonthly } from "./cadence";

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function goalContributionMonthly(goal: Goal, state: PlannerState): number {
  if (goal.fundingMode === "manual") return Math.max(0, n(goal.manualContributionMonthly));

  const ids = new Set(goal.budgetLineIds ?? []);
  const lines = (state.budgetLines ?? []).filter((l) => ids.has(l.id));
  const sum = lines.reduce((acc, l) => acc + toMonthly(n(l.amount), l.cadence), 0);
  return Math.max(0, sum);
}

export function monthsToHitGoal(goal: Goal, contribMonthly: number): number | null {
  const remaining = Math.max(0, n(goal.targetAmount) - n(goal.currentAmount));
  if (remaining <= 0) return 0;
  if (contribMonthly <= 0) return null;
  return Math.ceil(remaining / contribMonthly);
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function monthsUntilDueDate(dueISO?: string): number | null {
  if (!dueISO) return null;
  const due = new Date(dueISO);
  if (Number.isNaN(due.getTime())) return null;

  const now = new Date();
  const ymNow = now.getFullYear() * 12 + now.getMonth();
  const ymDue = due.getFullYear() * 12 + due.getMonth();

  const diff = ymDue - ymNow;
  // If due date is in the same month but earlier day, treat as 0
  return diff < 0 ? 0 : diff + 1; // inclusive-ish (simple planner)
}

export function requiredMonthlyToHitBy(goal: Goal, dueISO?: string): number | null {
  const m = monthsUntilDueDate(dueISO);
  if (m === null || m <= 0) return null;

  const remaining = Math.max(0, n(goal.targetAmount) - n(goal.currentAmount));
  if (remaining <= 0) return 0;

  return remaining / m;
}

/** New helper: include FHSS for deposit goals when enabled */
export function goalContributionMonthlyWithFHSS(goal: Goal, state: PlannerState): number {
  const base = goalContributionMonthly(goal, state);

  const fhssEnabled = !!state.fhss?.enabled;
  if (!fhssEnabled) return base;

  // Only apply FHSS to deposit goals
  if (goal.type !== "deposit") return base;

  const salary = Math.max(0, n(state.fhss.salarySacrificeMonthly));
  const personal = Math.max(0, n(state.fhss.personalContribMonthly));
  const fhssMonthly = salary + personal;

  return base + fhssMonthly;
}