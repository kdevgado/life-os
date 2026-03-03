export type PayCycle = "weekly" | "fortnightly" | "monthly";
export type BudgetLineType = "expense" | "savings";
export type Cadence = "weekly" | "fortnightly" | "monthly" | "yearly";

export type BudgetLine = {
  id: string;
  name: string;
  type: BudgetLineType;
  amount: number;
  cadence: Cadence;
};

export type GoalType = "deposit" | "emergency" | "car" | "custom";

export type Goal = {
  id: string;
  title: string;
  type: GoalType;

  targetAmount: number;
  currentAmount: number;

  // Optional target date (ISO yyyy-mm-dd)
  dueDate?: string;

  // How the goal is funded
  fundingMode: "budgetLines" | "manual";
  budgetLineIds: string[];         // usually pick savings lines
  manualContributionMonthly: number;
};

export type PlannerState = {
  payCycle: PayCycle;
  incomeAfterTaxMonthly: number;
  budgetLines: BudgetLine[];
  goals: Goal[];
  notes: string;

  // legacy fields (migration only)
  rentMonthly?: number;
  transportMonthly?: number;
  savingsMonthly?: number;
};