import React from "react";
import PlannerApp from "./planner/PlannerApp";
import BoardView from "./BoardView";
import DayCalendarPanel from "../dashboard/DayCalendarPanel";

type PlanTab = "board" | "calendar" | "planner";

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
          </div>
        </header>

        <div className="lo-plan__content">
          <div
            className="lo-plan__panel"
            hidden={tab !== "board"}
            aria-hidden={tab !== "board"}
          >
            <BoardView />
          </div>

          <div
            className="lo-plan__placeholder"
            hidden={tab !== "calendar"}
            aria-hidden={tab !== "calendar"}
          >
            <DayCalendarPanel
              startHour={6}
              endHour={24}
              storageKey="lifeos_calendar_day_events_v1"
              providerStorageKey="lifeos_calendar_provider_v1"
              onDropTask={({ task, dateKey, hour }) => {
                console.log("Plan task scheduled", { task, dateKey, hour });
              }}
            />
          </div>

          <div
            className="lo-plan__panel"
            hidden={tab !== "planner"}
            aria-hidden={tab !== "planner"}
          >
            <PlannerApp />
          </div>
        </div>
      </div>
    </section>
  );
}
