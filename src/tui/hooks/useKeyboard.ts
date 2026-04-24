import { useInput } from "ink";
import { useState, useCallback } from "react";

export type View = "overview" | "xray" | "tools" | "files" | "recommendations";

const VIEW_ORDER: View[] = ["overview", "xray", "tools", "files", "recommendations"];

interface KeyboardState {
  currentView: View;
  setView: (view: View) => void;
}

export function useKeyboard(onQuit: () => void, onSessionSwitch?: () => void): KeyboardState {
  const [currentView, setCurrentView] = useState<View>("overview");

  const setView = useCallback((view: View) => setCurrentView(view), []);

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      onQuit();
      return;
    }

    if (input === "s" || input === "S") {
      onSessionSwitch?.();
      return;
    }

    let nextView: View | null = null;

    switch (input) {
      case "o": case "O": nextView = "overview"; break;
      case "x": case "X": nextView = "xray"; break;
      case "t": case "T": nextView = "tools"; break;
      case "f": case "F": nextView = "files"; break;
      case "r": case "R": nextView = "recommendations"; break;
      case "1": nextView = "overview"; break;
      case "2": nextView = "xray"; break;
      case "3": nextView = "tools"; break;
      case "4": nextView = "files"; break;
      case "5": nextView = "recommendations"; break;
      case "h": case "H":
        {
          const idx = VIEW_ORDER.indexOf(currentView);
          nextView = VIEW_ORDER[(idx - 1 + VIEW_ORDER.length) % VIEW_ORDER.length]!;
        }
        break;
      case "l": case "L":
        {
          const idx = VIEW_ORDER.indexOf(currentView);
          nextView = VIEW_ORDER[(idx + 1) % VIEW_ORDER.length]!;
        }
        break;
    }

    if (key.leftArrow) {
      const idx = VIEW_ORDER.indexOf(currentView);
      nextView = VIEW_ORDER[(idx - 1 + VIEW_ORDER.length) % VIEW_ORDER.length]!;
    }
    if (key.rightArrow) {
      const idx = VIEW_ORDER.indexOf(currentView);
      nextView = VIEW_ORDER[(idx + 1) % VIEW_ORDER.length]!;
    }

    if (nextView !== null && nextView !== currentView) {
      setCurrentView(nextView);
    }
  });

  return { currentView, setView };
}
