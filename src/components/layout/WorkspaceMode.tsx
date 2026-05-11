import React from "react";
import FloatingWorkspace from "./FloatingWorkspace";
import PlanWorkspace from "../planning/PlanWorkspace";

type WorkspaceMode = "focus" | "plan";

export default function WorkspaceMode() {
  const [mode, setMode] = React.useState<WorkspaceMode>("focus");

  React.useEffect(() => {
    const saved = localStorage.getItem("lifeos_workspace_mode");
    if (saved === "plan" || saved === "focus") {
      setMode(saved);
    }
  }, []);

  React.useEffect(() => {
    localStorage.setItem("lifeos_workspace_mode", mode);
  }, [mode]);

  return (
    <>
      <div className="lo-mode-switcher" role="tablist" aria-label="Workspace mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "plan"}
          className={`lo-mode-switcher__btn ${mode === "plan" ? "is-active" : ""}`}
          onClick={() => setMode("plan")}
        >
          Plan
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={mode === "focus"}
          className={`lo-mode-switcher__btn ${mode === "focus" ? "is-active" : ""}`}
          onClick={() => setMode("focus")}
        >
          Focus
        </button>
      </div>

      {mode === "focus" ? <FloatingWorkspace /> : <PlanWorkspace />}
    </>
  );
}
