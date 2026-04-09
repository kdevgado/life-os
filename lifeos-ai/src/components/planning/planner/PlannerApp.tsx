import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { load, save } from "../../../lib/storage";
import { defaultPlannerState } from "../../../data/defaults";
import type { PlannerState } from "../../../types/planner";
import { getJwt, onAuthChange } from "../../../lib/identity";
import { normalizePlannerState } from "../../../lib/plannerNormalize";
import BudgetPanel from "./BudgetPanel";
import { toMonthly } from "../../../lib/cadence";
import GoalsPanel from "./GoalsPanel";
import FHSSPanel from "./FHSSPanel";

export default function PlannerApp() {
  const ignoreNextSaveRef = useRef(false);
  const [state, setState] = useState<PlannerState>(() => defaultPlannerState);

  const reloadPlanner = useCallback(async () => {
    const jwt = await getJwt();
    ignoreNextSaveRef.current = true;

    if (!jwt) {
      const local = load(defaultPlannerState);
      setState(normalizePlannerState(local, defaultPlannerState));
      return;
    }

    const res = await fetch("/.netlify/functions/planner", {
      headers: { Authorization: `Bearer ${jwt}` },
    });

    if (!res.ok) {
      const local = load(defaultPlannerState);
      setState(normalizePlannerState(local, defaultPlannerState));
      return;
    }

    const remote = await res.json();
    setState(normalizePlannerState(remote, defaultPlannerState));
  }, []);

  useEffect(() => {
    reloadPlanner();
  }, [reloadPlanner]);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    (async () => {
      unsub = await onAuthChange(() => reloadPlanner());
    })();
    return () => {
      if (unsub) unsub();
    };
  }, [reloadPlanner]);

  const hydratedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (ignoreNextSaveRef.current) {
      ignoreNextSaveRef.current = false;
      return;
    }
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    if (timerRef.current) window.clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(async () => {
      const jwt = await getJwt();
      if (!jwt) {
        save(state);
        return;
      }
      await fetch("/.netlify/functions/planner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(state),
      });
    }, 700);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [state]);

  const totals = useMemo(() => {
    const lines = state.budgetLines ?? [];
    const expenses = lines.filter(l => l.type === "expense").reduce((a, l) => a + toMonthly(l.amount, l.cadence), 0);
    const savings  = lines.filter(l => l.type === "savings").reduce((a, l) => a + toMonthly(l.amount, l.cadence), 0);
    const leftover = (state.incomeAfterTaxMonthly || 0) - expenses - savings;
    return { expenses, savings, leftover };
  }, [state]);

  return (
    <div className="container planner">
      <header className="page-header">
        <h1>Life OS Planner</h1>
        <p className="muted">Monthly view • Saved automatically</p>
      </header>

      <div className="grid">
        <section className="card">
          <h2>Income</h2>
          <label>
            Monthly income (after tax)
            <input
              type="number"
              value={state.incomeAfterTaxMonthly}
              onChange={(e) =>
                setState((s) => ({ ...s, incomeAfterTaxMonthly: Number(e.target.value) }))
              }
            />
          </label>

          <label>
            Pay cycle
            <select
              value={state.payCycle}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  payCycle: e.target.value as PlannerState["payCycle"],
                }))
              }
            >
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </section>

        <BudgetPanel state={state} setState={setState} />

        <FHSSPanel state={state} setState={setState} />

        <GoalsPanel state={state} setState={setState} />

        <section className="card">
          <h2>Summary</h2>
          <div className="muted">Expenses: {totals.expenses.toFixed(0)}</div>
          <div className="muted">Savings: {totals.savings.toFixed(0)}</div>
          <div className="big" style={{ marginTop: 10 }}>
            Leftover this month: <strong>{Number.isFinite(totals.leftover) ? totals.leftover.toFixed(0) : "0"}</strong>
          </div>
          <p className="muted">Tip: aim leftover ≥ 0.</p>
        </section>
      </div>
    </div>
  );
}