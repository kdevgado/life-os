import React from "react";
import PlannerApp from "./planner/PlannerApp";
import BoardView from "./BoardView";
import DayCalendarPanel from "../dashboard/DayCalendarPanel";

type PlanTab = "board" | "calendar" | "planner";

const PLAN_TABS: Array<{ value: PlanTab; label: string }> = [
  { value: "board", label: "Board" },
  { value: "calendar", label: "Calendar" },
  { value: "planner", label: "Planner" },
];

export default function PlanWorkspace() {
  const [tab, setTab] = React.useState<PlanTab>("board");
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  React.useEffect(() => {
    if (!mobileMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement;
      if (target.closest(".lo-plan__mobile-nav")) return;
      setMobileMenuOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [mobileMenuOpen]);

  function chooseTab(nextTab: PlanTab) {
    setTab(nextTab);
    setMobileMenuOpen(false);
  }

  return (
    <section className="lo-plan" aria-label="Planning workspace">
      <div className="lo-plan__mobile-nav" aria-label="Planning views">
        <button
          type="button"
          className="lo-plan__mobile-trigger"
          aria-label="Open planning views"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((value) => !value)}
        >
          <img src="/icons/white/menu-burger.png" alt="" aria-hidden="true" />
        </button>

        {mobileMenuOpen ? (
          <div className="lo-plan__mobile-menu" role="menu">
            {PLAN_TABS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="menuitem"
                className={tab === item.value ? "is-active" : ""}
                onClick={() => chooseTab(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

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
            {PLAN_TABS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={tab === item.value}
                className={tab === item.value ? "is-active" : ""}
                onClick={() => setTab(item.value)}
              >
                {item.label}
              </button>
            ))}
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
              view="week"
              showSettings={false}
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
