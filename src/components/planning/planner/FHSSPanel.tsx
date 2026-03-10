import React, { useMemo } from "react";
import type { PlannerState } from "../../../types/planner";
import { capRemainingThisFY, estimateEligibleThisFY, fhssMonthlyContribution } from "../../../lib/fhss";

type Props = {
  state: PlannerState;
  setState: React.Dispatch<React.SetStateAction<PlannerState>>;
};

export default function FHSSPanel({ state, setState }: Props) {
  const fhss = state.fhss;

  const derived = useMemo(() => {
    const monthly = fhssMonthlyContribution(fhss);
    const estEligible = estimateEligibleThisFY(fhss);
    const capRemain = capRemainingThisFY({ ...fhss, estEligibleThisFY: estEligible });
    return { monthly, estEligible, capRemain };
  }, [fhss]);

  return (
    <section className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>FHSS (Optional)</h2>

        <label style={{ display: "flex", alignItems: "center", gap: 10, margin: 0 }}>
          <input
            type="checkbox"
            checked={!!fhss.enabled}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                fhss: { ...s.fhss, enabled: e.target.checked },
              }))
            }
            style={{ width: 18, height: 18 }}
          />
          Enable
        </label>
      </div>

      <div className="muted" style={{ marginTop: 6 }}>
        Track First Home Super Saver Scheme contributions. Estimates only.
      </div>

      {!fhss.enabled ? (
        <div className="muted" style={{ marginTop: 12 }}>
          FHSS is disabled. Turn it on if you’re using salary sacrifice / personal super contributions for your first home.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <label>
              Salary sacrifice (monthly)
              <input
                type="number"
                value={fhss.salarySacrificeMonthly}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    fhss: { ...s.fhss, salarySacrificeMonthly: Number(e.target.value) },
                  }))
                }
              />
            </label>

            <label>
              Personal contributions (monthly)
              <input
                type="number"
                value={fhss.personalContribMonthly}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    fhss: { ...s.fhss, personalContribMonthly: Number(e.target.value) },
                  }))
                }
              />
            </label>

            <label>
              Eligible cap per FY (simple)
              <input
                type="number"
                value={fhss.eligibleCapPerFY}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    fhss: { ...s.fhss, eligibleCapPerFY: Number(e.target.value) },
                  }))
                }
              />
            </label>

            <label>
              FY start month (AU = July)
              <select
                value={fhss.financialYearStartMonth}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    fhss: { ...s.fhss, financialYearStartMonth: Number(e.target.value) },
                  }))
                }
              >
                <option value={0}>January</option>
                <option value={1}>February</option>
                <option value={2}>March</option>
                <option value={3}>April</option>
                <option value={4}>May</option>
                <option value={5}>June</option>
                <option value={6}>July</option>
                <option value={7}>August</option>
                <option value={8}>September</option>
                <option value={9}>October</option>
                <option value={10}>November</option>
                <option value={11}>December</option>
              </select>
            </label>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="muted">FHSS monthly total: {derived.monthly.toFixed(0)}</div>
            <div className="muted">Estimated eligible this FY: {derived.estEligible.toFixed(0)}</div>
            <div className="big" style={{ marginTop: 6 }}>
              Cap remaining (estimate): <strong>{derived.capRemain.toFixed(0)}</strong>
            </div>
          </div>
        </>
      )}
    </section>
  );
}