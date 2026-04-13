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

  goals: [
    {
      id: "goal_deposit",
      title: "House deposit",
      type: "deposit",
      targetAmount: 60000,
      currentAmount: 0,
      dueDate: "",
      fundingMode: "budgetLines",
      budgetLineIds: ["savings"], // points to your Savings budget line id
      manualContributionMonthly: 0,
    },
    {
      id: "goal_emergency",
      title: "Emergency fund",
      type: "emergency",
      targetAmount: 10000,
      currentAmount: 0,
      dueDate: "",
      fundingMode: "manual",
      budgetLineIds: [],
      manualContributionMonthly: 200,
    },
  ],

  fhss: {
    enabled: false,
    salarySacrificeMonthly: 0,
    personalContribMonthly: 0,
    eligibleCapPerFY: 15000,
    financialYearStartMonth: 6,
    estEligibleThisFY: 0,
  },
};