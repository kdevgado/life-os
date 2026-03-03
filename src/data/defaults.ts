import type { PlannerState } from "../types/planner";

export const defaultPlannerState: PlannerState = {
  payCycle: "monthly",
  incomeAfterTaxMonthly: 0,
  budgetLines: [
    { id: "rent", name: "Rent", type: "expense", amount: 1400, cadence: "monthly" },
    { id: "transport", name: "Transport", type: "expense", amount: 400, cadence: "monthly" },
    { id: "savings", name: "Savings", type: "savings", amount: 500, cadence: "monthly" },
  ],
  notes: "",
};