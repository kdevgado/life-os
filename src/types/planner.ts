export type PayCycle = "weekly" | "fortnightly" | "monthly";

export type PlannerState = {
  payCycle: PayCycle;
  incomeAfterTaxMonthly: number;
  rentMonthly: number;
  transportMonthly: number;
  savingsMonthly: number;
  notes: string;
};