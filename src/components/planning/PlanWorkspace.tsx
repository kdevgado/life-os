import React from "react";
import PlannerApp from "./planner/PlannerApp";
import BoardView from "./BoardView";
import TasksApp from "../tasks/TasksApp";

type PlanTab = "board" | "calendar" | "planner" | "tasks";

export default function PlanWorkspace() {
  const [tab, setTab] = React.useState<PlanTab>("board");

  return (
    <section className="lo-plan" aria-label="Planning workspace">
      <div className="lo-plan__shell">
        <header className="lo-plan__header">
          <div>
            <p className="lo-plan__eyebrow">Life OS</p>
            <h2 className="lo-plan__title">Plan</h2>
          </div>

          <div
            className="lo-plan__tabs"
            role="tablist"
            aria-label="Planning views"
          >
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
            <button
              type="button"
              className={tab === "tasks" ? "is-active" : ""}
              onClick={() => setTab("tasks")}
            >
              Tasks
            </button>
          </div>
        </header>

        <div className="lo-plan__content">
          {tab === "board" && (
            <div className="lo-plan__panel">
              <BoardView />
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

          {tab === "tasks" && (
            <div className="lo-plan__panel">
              <TasksApp mode="plan" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
