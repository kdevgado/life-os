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

export type FHSSState = {
  enabled: boolean;

  // user inputs (monthly)
  salarySacrificeMonthly: number;
  personalContribMonthly: number;

  // FY cap settings (simple defaults; you can refine later)
  eligibleCapPerFY: number; // e.g. 15000
  financialYearStartMonth: number; // 0=Jan ... 6=Jul (Australia FY starts July)

  // progress tracking
  estEligibleThisFY: number; // computed or manually tracked (we’ll compute from monthly)
};

export type PlannerState = {
  payCycle: PayCycle;
  incomeAfterTaxMonthly: number;
  budgetLines: BudgetLine[];
  goals: Goal[];
  notes: string;

  // Future feature: FHSS (First Home Super Saver Scheme) support
  fhss: FHSSState;

  // legacy fields (migration only)
  rentMonthly?: number;
  transportMonthly?: number;
  savingsMonthly?: number;
};