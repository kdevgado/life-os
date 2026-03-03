export type PayCycle = "weekly" | "fortnightly" | "monthly";

export type BudgetLineType = "expense" | "savings";

export type Cadence = "weekly" | "fortnightly" | "monthly" | "yearly";

export type BudgetLine = {
  id: string;
  name: string;
  type: BudgetLineType;

  amount: number;   // amount per cadence (e.g. $25 weekly)
  cadence: Cadence; // weekly/fortnightly/monthly/yearly
};

export type PlannerState = {
  payCycle: PayCycle;
  incomeAfterTaxMonthly: number;
  budgetLines: BudgetLine[];
  notes: string;

  // legacy (migration only)
  rentMonthly?: number;
  transportMonthly?: number;
  savingsMonthly?: number;
};