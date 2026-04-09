import type { FHSSState } from "../types/planner";

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function fhssMonthlyContribution(f: FHSSState): number {
  return Math.max(0, n(f.salarySacrificeMonthly) + n(f.personalContribMonthly));
}

export function fyStartForDate(d: Date, startMonth: number): Date {
  // startMonth: 6 = July
  const year = d.getMonth() >= startMonth ? d.getFullYear() : d.getFullYear() - 1;
  return new Date(year, startMonth, 1);
}

export function monthsElapsedInFY(now: Date, startMonth: number): number {
  const start = fyStartForDate(now, startMonth);
  const ymNow = now.getFullYear() * 12 + now.getMonth();
  const ymStart = start.getFullYear() * 12 + start.getMonth();
  return Math.max(0, ymNow - ymStart + 1); // inclusive-ish
}

export function estimateEligibleThisFY(f: FHSSState, now = new Date()): number {
  const m = monthsElapsedInFY(now, f.financialYearStartMonth);
  return fhssMonthlyContribution(f) * m;
}

export function capRemainingThisFY(f: FHSSState, now = new Date()): number {
  const used = Math.max(0, n(f.estEligibleThisFY) || estimateEligibleThisFY(f, now));
  return Math.max(0, n(f.eligibleCapPerFY) - used);
}