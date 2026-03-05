import React, { useEffect, useState } from "react";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function WidgetRail() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const h = now.getHours();
  const m = now.getMinutes();

  return (
    <aside className="iw-rail" aria-label="Widgets">
      <div className="iw-widget">
        <div className="iw-widget-title">Clock</div>
        <div className="iw-clock">{pad(h)}:{pad(m)}</div>
        <div className="iw-subtle">
          {now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
        </div>
      </div>

      <div className="iw-widget">
        <div className="iw-widget-title">Focus</div>
        <div className="iw-subtle">Pick a small win for today.</div>
        <a className="iw-widget-btn" href="/tasks">Open Tasks</a>
      </div>

      <div className="iw-widget">
        <div className="iw-widget-title">Shortcuts</div>
        <div className="iw-links">
          <a href="/planner">Budget</a>
          <a href="/timeline">Timeline</a>
          <a href="/settings">Theme</a>
        </div>
      </div>
    </aside>
  );
}