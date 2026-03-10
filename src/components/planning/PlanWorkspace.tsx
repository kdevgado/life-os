import React from "react";
import PlannerApp from "../planner/PlannerApp";

type PlanTab = "board" | "calendar" | "planner";

export default function PlanWorkspace() {
  const [tab, setTab] = React.useState<PlanTab>("planner");

  return (
    <section className="lo-plan" aria-label="Planning workspace">
      <div className="lo-plan__shell">
        <header className="lo-plan__header">
          <div>
            <p className="lo-plan__eyebrow">Life OS</p>
            <h2 className="lo-plan__title">Plan</h2>
          </div>

          <div className="lo-plan__tabs" role="tablist" aria-label="Planning views">
            <button
              type="button"
              className={tab === "board" ? "is-active" : ""}
              onClick={() => setTab("board")}
            >
              Board
            </button>
            <button
              type="button"
              className={tab === "calendar" ? "is-active" : ""}
              onClick={() => setTab("calendar")}
            >
              Calendar
            </button>
            <button
              type="button"
              className={tab === "planner" ? "is-active" : ""}
              onClick={() => setTab("planner")}
            >
              Planner
            </button>
          </div>
        </header>

        <div className="lo-plan__content">
          {tab === "board" && (
            <div className="lo-plan__placeholder">
              <h3>Board view</h3>
              <p>Add your kanban-style planning board here.</p>
            </div>
          )}

          {tab === "calendar" && (
            <div className="lo-plan__placeholder">
              <h3>Calendar view</h3>
              <p>Add your fullscreen planning calendar here.</p>
            </div>
          )}

          {tab === "planner" && (
            <div className="lo-plan__panel">
              <PlannerApp />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}