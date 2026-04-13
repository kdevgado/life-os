import type { Cadence } from "../types/planner";

export function toMonthly(amount: number, cadence: Cadence): number {
  const a = Number.isFinite(amount) ? amount : 0;
  switch (cadence) {
    case "weekly":
      return a * (52 / 12);
    case "fortnightly":
      return a * (26 / 12);
    case "yearly":
      return a / 12;
    case "monthly":
    default:
      return a;
  }
}