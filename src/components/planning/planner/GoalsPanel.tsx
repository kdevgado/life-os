import React, { useMemo } from "react";
import type { PlannerState, Goal, GoalType } from "../../../types/planner";
import { goalContributionMonthlyWithFHSS, goalContributionMonthly, monthsToHitGoal, addMonths, requiredMonthlyToHitBy } from "../../../lib/goals";

const makeId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `id_${Math.random().toString(16).slice(2)}`);

const GOAL_TYPES: { value: GoalType; label: string }[] = [
  { value: "deposit", label: "Deposit" },
  { value: "emergency", label: "Emergency" },
  { value: "car", label: "Car" },
  { value: "custom", label: "Custom" },
];

type Props = {
  state: PlannerState;
  setState: React.Dispatch<React.SetStateAction<PlannerState>>;
};

export default function GoalsPanel({ state, setState }: Props) {
  const goals = state.goals ?? [];

  const savingsLines = useMemo(
    () => (state.budgetLines ?? []).filter((l) => l.type === "savings"),
    [state.budgetLines]
  );

  const updateGoal = (id: string, patch: Partial<Goal>) => {
    setState((s) => ({
      ...s,
      goals: (s.goals ?? []).map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));
  };

  const removeGoal = (id: string) => {
    setState((s) => ({ ...s, goals: (s.goals ?? []).filter((g) => g.id !== id) }));
  };

  const addGoal = () => {
    const g: Goal = {
      id: makeId(),
      title: "New goal",
      type: "custom",
      targetAmount: 0,
      currentAmount: 0,
      dueDate: "",
      fundingMode: savingsLines.length ? "budgetLines" : "manual",
      budgetLineIds: savingsLines.length ? [savingsLines[0].id] : [],
      manualContributionMonthly: 0,
    };
    setState((s) => ({ ...s, goals: [...(s.goals ?? []), g] }));
  };

  const toggleFundingLine = (goal: Goal, lineId: string) => {
    const set = new Set(goal.budgetLineIds ?? []);
    if (set.has(lineId)) set.delete(lineId);
    else set.add(lineId);
    updateGoal(goal.id, { budgetLineIds: Array.from(set) });
  };

  return (
    <section className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Goals</h2>
        <button type="button" className="btn ghost" onClick={addGoal}>
          + Add goal
        </button>
      </div>

      <div className="muted" style={{ marginTop: 6 }}>
        Track targets and see projected completion dates.
      </div>

      <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
        {goals.map((g) => {
          const contrib = goalContributionMonthlyWithFHSS(g, state);
          const months = monthsToHitGoal(g, contrib);
          const doneDate =
            months === null ? null : addMonths(new Date(), months).toLocaleDateString(undefined, { year: "numeric", month: "short" });

          const req = requiredMonthlyToHitBy(g, g.dueDate || undefined);

          const remaining = Math.max(0, (g.targetAmount || 0) - (g.currentAmount || 0));

          return (
            <div
              key={g.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: 12,
                background: "color-mix(in oklab, var(--panel) 70%, transparent)",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  value={g.title}
                  onChange={(e) => updateGoal(g.id, { title: e.target.value })}
                  aria-label="Goal title"
                  style={{ width: "100%" }}
                />
                <button type="button" className="btn ghost" onClick={() => removeGoal(g.id)} title="Remove goal">
                  ✕
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
                <label>
                  Type
                  <select
                    value={g.type}
                    onChange={(e) => updateGoal(g.id, { type: e.target.value as GoalType })}
                  >
                    {GOAL_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Due date (optional)
                  <input
                    type="date"
                    value={g.dueDate || ""}
                    onChange={(e) => updateGoal(g.id, { dueDate: e.target.value })}
                  />
                </label>

                <label>
                  Target amount
                  <input
                    type="number"
                    value={g.targetAmount}
                    onChange={(e) => updateGoal(g.id, { targetAmount: Number(e.target.value) })}
                  />
                </label>

                <label>
                  Current amount
                  <input
                    type="number"
                    value={g.currentAmount}
                    onChange={(e) => updateGoal(g.id, { currentAmount: Number(e.target.value) })}
                  />
                </label>
              </div>

              <div style={{ marginTop: 10 }}>
                <label>
                  Funding
                  <select
                    value={g.fundingMode}
                    onChange={(e) =>
                      updateGoal(g.id, {
                        fundingMode: e.target.value === "manual" ? "manual" : "budgetLines",
                      })
                    }
                  >
                    <option value="budgetLines">Use savings budget lines</option>
                    <option value="manual">Manual monthly contribution</option>
                  </select>
                </label>

                {g.fundingMode === "manual" ? (
                  <label style={{ marginTop: 8 }}>
                    Contribution per month
                    <input
                      type="number"
                      value={g.manualContributionMonthly}
                      onChange={(e) => updateGoal(g.id, { manualContributionMonthly: Number(e.target.value) })}
                    />
                  </label>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                      Select which savings lines fund this goal:
                    </div>
                    {savingsLines.length === 0 ? (
                      <div className="muted">No savings lines found. Add a “Savings” item in Budget.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 6 }}>
                        {savingsLines.map((l) => (
                          <label key={l.id} style={{ display: "flex", gap: 10, alignItems: "center", margin: 0 }}>
                            <input
                              type="checkbox"
                              checked={(g.budgetLineIds ?? []).includes(l.id)}
                              onChange={() => toggleFundingLine(g, l.id)}
                              style={{ width: 18, height: 18 }}
                            />
                            <span>{l.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="muted">Remaining: {remaining.toFixed(0)}</div>
                <div className="muted">Funding: {contrib.toFixed(0)} / month</div>

                {months === 0 ? (
                  <div className="big" style={{ marginTop: 6 }}>
                    ✅ Goal reached
                  </div>
                ) : months === null ? (
                  <div className="big" style={{ marginTop: 6 }}>
                    Add a monthly contribution to get a projection.
                  </div>
                ) : (
                  <div className="big" style={{ marginTop: 6 }}>
                    Est. completion: <strong>{doneDate}</strong> ({months} months)
                  </div>
                )}

                {req !== null && req > 0 && (
                  <div className="muted" style={{ marginTop: 6 }}>
                    To hit by due date: ~{req.toFixed(0)} / month
                  </div>
                )}

                {state.fhss?.enabled && g.type === "deposit" && (
                <div className="muted" style={{ marginTop: 6 }}>
                    Deposit power (incl. FHSS): {contrib.toFixed(0)} / month
                </div>
                )}

                {state.fhss?.enabled && g.type === "deposit" && (
                <div className="muted" style={{ fontSize: 13 }}>
                    Includes FHSS: {(Number(state.fhss.salarySacrificeMonthly) + Number(state.fhss.personalContribMonthly)).toFixed(0)} / month
                </div>
                )}
              </div>
            </div>
          );
        })}

        {goals.length === 0 && <div className="muted">No goals yet — click “Add goal”.</div>}
      </div>
    </section>
  );
}