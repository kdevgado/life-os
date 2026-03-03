import React, { useEffect, useMemo, useState } from "react";
import { load, save } from "../../lib/storage";
import { defaultPlannerState } from "../../data/defaults";
import type { PlannerState } from "../../types/planner";
import { getJwt } from "../../lib/identity";

export default function PlannerApp() {
  const [state, setState] = useState<PlannerState>(() => defaultPlannerState);

  useEffect(() => {
    (async () => {
      const jwt = await getJwt();

      if (!jwt) {
        setState(load(defaultPlannerState));
        return;
      }

      const res = await fetch("/.netlify/functions/planner", {
        headers: { Authorization: `Bearer ${jwt}` },
      });

      if (!res.ok) {
        setState(load(defaultPlannerState));
        return;
      }

      const remote = await res.json();
      setState(remote ?? defaultPlannerState);
    })();
  }, []);

  const hydratedRef = React.useRef(false);
  const timerRef = React.useRef<number | null>(null);

  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }

    if (timerRef.current) window.clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(async () => {
      const jwt = await getJwt();

      if (!jwt) {
        save(state); // keep your current local autosave
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

  const leftover = useMemo(() => {
    const spent = state.rentMonthly + state.transportMonthly + state.savingsMonthly;
    return state.incomeAfterTaxMonthly - spent;
  }, [state]);

  return (
    <div className="container">
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
              onChange={(e) => setState((s) => ({ ...s, incomeAfterTaxMonthly: Number(e.target.value) }))}
            />
          </label>
          <label>
            Pay cycle
            <select
              value={state.payCycle}
              onChange={(e) => setState((s) => ({ ...s, payCycle: e.target.value as PlannerState["payCycle"] }))}
            >
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </section>

        <section className="card">
          <h2>Expenses & savings</h2>
          <label>
            Rent (monthly)
            <input
              type="number"
              value={state.rentMonthly}
              onChange={(e) => setState((s) => ({ ...s, rentMonthly: Number(e.target.value) }))}
            />
          </label>
          <label>
            Transport (monthly)
            <input
              type="number"
              value={state.transportMonthly}
              onChange={(e) => setState((s) => ({ ...s, transportMonthly: Number(e.target.value) }))}
            />
          </label>
          <label>
            Savings (monthly)
            <input
              type="number"
              value={state.savingsMonthly}
              onChange={(e) => setState((s) => ({ ...s, savingsMonthly: Number(e.target.value) }))}
            />
          </label>
        </section>

        <section className="card">
          <h2>Summary</h2>
          <div className="big">
            Leftover this month: <strong>{Number.isFinite(leftover) ? leftover.toFixed(0) : "0"}</strong>
          </div>
          <p className="muted">Tip: aim leftover ≥ 0 (or adjust savings).</p>
        </section>
      </div>
    </div>
  );
}