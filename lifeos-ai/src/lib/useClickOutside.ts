import React from "react";

export function useClickOutside<T extends HTMLElement>(
  onOutside: () => void,
  enabled: boolean = true
) {
  const ref = React.useRef<T | null>(null);

  React.useEffect(() => {
    if (!enabled) return;

    function handlePointerDown(event: PointerEvent) {
      const node = ref.current;
      const target = event.target as Node | null;

      if (!node || !target) return;
      if (node.contains(target)) return;

      onOutside();
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [onOutside, enabled]);

  return ref;
}