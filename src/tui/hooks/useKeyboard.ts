import { useInput } from "ink";
import { useState, useCallback } from "react";

export type View = "overview" | "tools" | "files" | "recommendations";

const VIEW_ORDER: View[] = ["overview", "tools", "files", "recommendations"];

interface KeyboardState {
  currentView: View;
  setView: (view: View) => void;
}

export function useKeyboard(onQuit: () => void): KeyboardState {
  const [currentView, setCurrentView] = useState<View>("overview");

  const setView = useCallback((view: View) => setCurrentView(view), []);

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      onQuit();
      return;
    }

    switch (input) {
      case "1":
        setCurrentView("overview");
        break;
      case "2":
        setCurrentView("tools");
        break;
      case "3":
        setCurrentView("files");
        break;
      case "4":
        setCurrentView("recommendations");
        break;
      case "h":
      case "H":
        // Previous view
        {
          const idx = VIEW_ORDER.indexOf(currentView);
          setCurrentView(VIEW_ORDER[(idx - 1 + VIEW_ORDER.length) % VIEW_ORDER.length]!);
        }
        break;
      case "l":
      case "L":
        // Next view
        {
          const idx = VIEW_ORDER.indexOf(currentView);
          setCurrentView(VIEW_ORDER[(idx + 1) % VIEW_ORDER.length]!);
        }
        break;
    }

    if (key.leftArrow) {
      const idx = VIEW_ORDER.indexOf(currentView);
      setCurrentView(VIEW_ORDER[(idx - 1 + VIEW_ORDER.length) % VIEW_ORDER.length]!);
    }
    if (key.rightArrow) {
      const idx = VIEW_ORDER.indexOf(currentView);
      setCurrentView(VIEW_ORDER[(idx + 1) % VIEW_ORDER.length]!);
    }
  });

  return { currentView, setView };
}
