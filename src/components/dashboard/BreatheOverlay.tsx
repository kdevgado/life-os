import { useEffect, useState } from "react";

type Props = {
  onClose: () => void;
};

const phases = [
  { key: "inhale", label: "Inhale", hint: "Breathe in slowly", duration: 4000 },
  { key: "hold", label: "Hold", hint: "Hold gently", duration: 4000 },
  { key: "exhale", label: "Exhale", hint: "Breathe out fully", duration: 6000 },
] as const;

export default function BreatheOverlay({ onClose }: Props) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  const phase = phases[phaseIndex];

  useEffect(() => {
    const fadeTimer = window.setTimeout(
      () => {
        setVisible(false);
      },
      Math.max(phase.duration - 350, 0),
    );

    const nextTimer = window.setTimeout(() => {
      setPhaseIndex((p) => (p + 1) % phases.length);
      setVisible(true);
    }, phase.duration);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(nextTimer);
    };
  }, [phaseIndex, phase.duration]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className={`lo-breathe phase-${phase.key}`}>
      <button className="lo-breathe__close" onClick={onClose} type="button">
        ✕
      </button>

      <div className="lo-breathe__center">
        <div className="lo-breathe__visual">
          <div className="lo-breathe__backdrop-circle" />

          <div
            className={`lo-breathe__orb phase-${phase.key}`}
            style={{ animationDuration: `${phase.duration}ms` }}
          >
            <div
              className={`lo-breathe__inner-copy ${visible ? "is-visible" : ""}`}
            >
              <div className="lo-breathe__text">{phase.label}</div>
            </div>
          </div>
        </div>

        <div className={`lo-breathe__copy ${visible ? "is-visible" : ""}`}>
          <div className="lo-breathe__hint">{phase.hint}</div>
        </div>
      </div>
    </div>
  );
}
