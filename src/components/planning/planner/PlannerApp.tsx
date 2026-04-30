import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { load, plannerStorageKey, save } from "../../../lib/storage";
import { defaultPlannerState } from "../../../data/defaults";
import type { PlannerState } from "../../../types/planner";
import { getCurrentUserId, getJwt, onAuthChange } from "../../../lib/identity";
import { normalizePlannerState } from "../../../lib/plannerNormalize";
import {
  EMPTY_RESOURCE_META,
  fetchAuthedResource,
  ResourceApiError,
  saveAuthedResource,
  type ResourceMeta,
} from "../../../lib/resourceApi";
import BudgetPanel from "./BudgetPanel";
import { toMonthly } from "../../../lib/cadence";
import GoalsPanel from "./GoalsPanel";
import FHSSPanel from "./FHSSPanel";

export default function PlannerApp() {
  const ignoreNextSaveRef = useRef(false);
  const [state, setState] = useState<PlannerState>(() => defaultPlannerState);
  const [saveError, setSaveError] = useState<string | null>(null);
  const serverMetaRef = useRef<ResourceMeta>(EMPTY_RESOURCE_META);

  const reloadPlanner = useCallback(async () => {
    const jwt = await getJwt();
    const userId = await getCurrentUserId();
    const localKey = plannerStorageKey(userId);
    const local = normalizePlannerState(
      load(defaultPlannerState, localKey),
      defaultPlannerState,
    );

    ignoreNextSaveRef.current = true;
    setSaveError(null);

    if (!jwt) {
      serverMetaRef.current = EMPTY_RESOURCE_META;
      setState(local);
      return;
    }

    try {
      const { data, meta } = await fetchAuthedResource<PlannerState>(
        "/.netlify/functions/planner",
        jwt,
      );
      const remote = normalizePlannerState(data, defaultPlannerState);
      serverMetaRef.current = meta;

      const shouldSeedRemoteFromLocal =
        !isPlannerStateEqual(local, defaultPlannerState) &&
        (meta.revision ?? 0) === 0;

      if (shouldSeedRemoteFromLocal) {
        setState(local);
        const saved = await saveAuthedResource(
          "/.netlify/functions/planner",
          jwt,
          local,
          meta,
        );
        serverMetaRef.current = saved.meta;
        return;
      }

      setState(remote);
    } catch (error) {
      console.error("Planner failed to load from account storage", error);
      setState(local);
      setSaveError(
        error instanceof Error
          ? `${error.message} Showing local planner backup.`
          : "Planner failed to load. Showing local planner backup.",
      );
    }
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
      hydratedRef.current = true;
      return;
    }
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    if (timerRef.current) window.clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(async () => {
      const jwt = await getJwt();
      const userId = await getCurrentUserId();
      const localKey = plannerStorageKey(userId);

      try {
        save(state, localKey);
      } catch (error) {
        console.error("Planner failed to save local backup", error);
      }

      if (!jwt) {
        return;
      }

      try {
        const { meta } = await saveAuthedResource(
          "/.netlify/functions/planner",
          jwt,
          state,
          serverMetaRef.current,
        );
        serverMetaRef.current = meta;
        setSaveError(null);
      } catch (error) {
        console.error("Planner failed to save to account storage", error);

        if (error instanceof ResourceApiError && error.status === 409) {
          setSaveError(
            "Planner changed in another tab or device. Reloading the latest version.",
          );
          void reloadPlanner();
          return;
        }

        setSaveError(
          error instanceof Error
            ? `${error.message} Local planner backup was kept.`
            : "Planner failed to save online. Local planner backup was kept.",
        );
      }
    }, 700);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [reloadPlanner, state]);

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
        {saveError && <p className="error">{saveError}</p>}
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

function isPlannerStateEqual(a: PlannerState, b: PlannerState) {
  return JSON.stringify(a) === JSON.stringify(b);
}
