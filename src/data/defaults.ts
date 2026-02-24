import type { PlannerState } from "../types/planner";

export const defaultPlannerState: PlannerState = {
  payCycle: "monthly",
  incomeAfterTaxMonthly: 0,
  rentMonthly: 1400,
  transportMonthly: 400,
  savingsMonthly: 0,
  notes: "",
};