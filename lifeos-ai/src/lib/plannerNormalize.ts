import type { PlannerState, BudgetLine } from "../types/planner";

const makeId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `id_${Math.random().toString(16).slice(2)}`);

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function normalizePlannerState(raw: unknown, fallback: PlannerState): PlannerState {
  const s = (raw ?? fallback) as any;

  // If budgetLines exists, normalise them (supports both old and new line shapes)
  if (Array.isArray(s.budgetLines)) {
    const lines: BudgetLine[] = s.budgetLines.map((l: any) => {
      // old shape support: { amountMonthly }
      if (l && "amountMonthly" in l) {
        return {
          id: String(l.id ?? makeId()),
          name: String(l.name ?? "Untitled"),
          type: l.type === "savings" ? "savings" : "expense",
          amount: num(l.amountMonthly),
          cadence: "monthly",
        };
      }

      // new shape
      return {
        id: String(l?.id ?? makeId()),
        name: String(l?.name ?? "Untitled"),
        type: l?.type === "savings" ? "savings" : "expense",
        amount: num(l?.amount),
        cadence:
          l?.cadence === "weekly" || l?.cadence === "fortnightly" || l?.cadence === "yearly"
            ? l.cadence
            : "monthly",
      };
    });

    const fhssFallback = {
    enabled: false,
    salarySacrificeMonthly: 0,
    personalContribMonthly: 0,
    eligibleCapPerFY: 15000,
    financialYearStartMonth: 6,
    estEligibleThisFY: 0,
    };

    const fhss = s.fhss ? { ...fhssFallback, ...s.fhss } : fhssFallback;

    const goals = Array.isArray(s.goals) ? s.goals : [];
    return { ...fallback, ...s, budgetLines: lines, goals, fhss };
  }
  

  // Legacy migrate from rent/transport/savings
  const migrated: BudgetLine[] = [
    { id: makeId(), name: "Rent", type: "expense", amount: num(s.rentMonthly), cadence: "monthly" },
    { id: makeId(), name: "Transport", type: "expense", amount: num(s.transportMonthly), cadence: "monthly" },
    { id: makeId(), name: "Savings", type: "savings", amount: num(s.savingsMonthly), cadence: "monthly" },
  ];

  const fhssFallback = {
    enabled: false,
    salarySacrificeMonthly: 0,
    personalContribMonthly: 0,
    eligibleCapPerFY: 15000,
    financialYearStartMonth: 6,
    estEligibleThisFY: 0,
    };

    const fhss = s.fhss ? { ...fhssFallback, ...s.fhss } : fhssFallback;

  const goals = Array.isArray(s.goals) ? s.goals : [];
  return { ...fallback, ...s, budgetLines: migrated, goals, fhss };
}