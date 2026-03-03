import React from "react";
import type { BudgetLine, PlannerState, Cadence } from "../../types/planner";
import { toMonthly } from "../../lib/cadence";

type Props = {
  state: PlannerState;
  setState: React.Dispatch<React.SetStateAction<PlannerState>>;
};

const makeId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `id_${Math.random().toString(16).slice(2)}`;

const CADENCES: { value: Cadence; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export default function BudgetPanel({ state, setState }: Props) {
  const lines = state.budgetLines ?? [];

  const updateLine = (id: string, patch: Partial<BudgetLine>) => {
    setState((s) => ({
      ...s,
      budgetLines: (s.budgetLines ?? []).map((l) =>
        l.id === id ? { ...l, ...patch } : l,
      ),
    }));
  };

  const removeLine = (id: string) => {
    setState((s) => ({
      ...s,
      budgetLines: (s.budgetLines ?? []).filter((l) => l.id !== id),
    }));
  };

  const addLine = () => {
    setState((s) => ({
      ...s,
      budgetLines: [
        ...(s.budgetLines ?? []),
        {
          id: makeId(),
          name: "New item",
          type: "expense",
          amount: 0,
          cadence: "monthly",
        },
      ],
    }));
  };

  return (
    <section className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0 }}>Budget</h2>
        <button type="button" className="btn ghost" onClick={addLine}>
          + Add item
        </button>
      </div>

      <div className="muted" style={{ marginTop: 6 }}>
        Enter amounts in the frequency you pay them — we convert everything to
        monthly.
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {lines.map((l) => {
          const monthly = toMonthly(l.amount, l.cadence);

          return (
            <div key={l.id} className="budget-row">
              <div className="budget-name">
                <input
                  value={l.name}
                  onChange={(e) => updateLine(l.id, { name: e.target.value })}
                  aria-label="Budget item name"
                />
                <div className="muted" style={{ fontSize: 12 }}>
                  ≈ {monthly.toFixed(0)} / month
                </div>
              </div>
              <div className="budget-type">
                <select
                  value={l.type}
                  onChange={(e) =>
                    updateLine(l.id, {
                      type:
                        e.target.value === "savings" ? "savings" : "expense",
                    })
                  }
                  aria-label="Budget item type"
                >
                  <option value="expense">Expense</option>
                  <option value="savings">Savings</option>
                </select>
              </div>

              <div
                className="budget-amount"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 140px",
                  gap: 10,
                }}
              >
                <input
                  type="number"
                  value={Number.isFinite(l.amount) ? l.amount : 0}
                  onChange={(e) =>
                    updateLine(l.id, { amount: Number(e.target.value) })
                  }
                  aria-label="Amount"
                />
                <select
                  value={l.cadence}
                  onChange={(e) =>
                    updateLine(l.id, { cadence: e.target.value as Cadence })
                  }
                  aria-label="Cadence"
                >
                  {CADENCES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="btn ghost budget-remove"
                onClick={() => removeLine(l.id)}
                title="Remove"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
