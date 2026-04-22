/**
 * Proactive alert system for Rasad TUI.
 *
 * Fires terminal bell + tracks alert state when critical thresholds are crossed.
 * Only fires each alert ONCE per threshold crossing to avoid spam.
 */

import { useState, useEffect, useRef } from "react";
import type { LiveStats } from "./useSessionWatcher.js";

export type AlertSeverity = "critical" | "warning" | "info";

export interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  timestamp: number;
}

interface AlertThresholds {
  contextWarning: boolean;
  contextCritical: boolean;
  costWarning: boolean;
  costCritical: boolean;
  retryLoop: boolean;
  errorSpike: boolean;
  readLoop: boolean;
  staleSession: boolean;
}

const EMPTY_THRESHOLDS: AlertThresholds = {
  contextWarning: false,
  contextCritical: false,
  costWarning: false,
  costCritical: false,
  retryLoop: false,
  errorSpike: false,
  readLoop: false,
  staleSession: false,
};

function bell(): void {
  process.stderr.write("\x07");
}

export function useAlerts(stats: LiveStats): {
  alerts: Alert[];
  latestAlert: Alert | null;
  dismissLatest: () => void;
} {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [latestAlert, setLatestAlert] = useState<Alert | null>(null);
  const firedRef = useRef<AlertThresholds>({ ...EMPTY_THRESHOLDS });
  const lastSessionRef = useRef<string>("");

  useEffect(() => {
    if (!stats.isActive) return;

    // Reset fired alerts when session changes
    if (stats.sessionId !== lastSessionRef.current) {
      firedRef.current = { ...EMPTY_THRESHOLDS };
      setAlerts([]);
      setLatestAlert(null);
      lastSessionRef.current = stats.sessionId;
    }

    const fired = firedRef.current;
    const newAlerts: Alert[] = [];

    // ── Context pressure ──
    if (stats.contextPercent >= 90 && !fired.contextCritical) {
      fired.contextCritical = true;
      newAlerts.push({
        id: "ctx-critical",
        severity: "critical",
        title: "Memory critical",
        detail: `${stats.contextPercent.toFixed(0)}% full — run /compact NOW`,
        timestamp: Date.now(),
      });
      bell();
    } else if (stats.contextPercent >= 75 && !fired.contextWarning) {
      fired.contextWarning = true;
      newAlerts.push({
        id: "ctx-warning",
        severity: "warning",
        title: "Memory filling up",
        detail: `${stats.contextPercent.toFixed(0)}% — consider /compact soon`,
        timestamp: Date.now(),
      });
      bell();
    }

    // ── Cost thresholds ──
    if (stats.estimatedCost >= 50 && !fired.costCritical) {
      fired.costCritical = true;
      newAlerts.push({
        id: "cost-critical",
        severity: "critical",
        title: `$${stats.estimatedCost.toFixed(0)} spent`,
        detail: "Split into smaller sessions or narrow scope",
        timestamp: Date.now(),
      });
      bell();
    } else if (stats.estimatedCost >= 20 && !fired.costWarning) {
      fired.costWarning = true;
      newAlerts.push({
        id: "cost-warning",
        severity: "warning",
        title: `$${stats.estimatedCost.toFixed(0)} and climbing`,
        detail: "Check if you're still on track",
        timestamp: Date.now(),
      });
    }

    // ── Retry loop: same file edited 4+ times ──
    if (!fired.retryLoop) {
      const editCounts = new Map<string, number>();
      for (const event of stats.events) {
        if ((event.toolName === "Edit" || event.toolName === "Write") && event.filePath) {
          editCounts.set(event.filePath, (editCounts.get(event.filePath) ?? 0) + 1);
        }
      }
      for (const [file, count] of editCounts) {
        if (count >= 4) {
          fired.retryLoop = true;
          newAlerts.push({
            id: "retry-loop",
            severity: "warning",
            title: "Possible retry loop",
            detail: `${file} edited ${count} times — AI may be stuck`,
            timestamp: Date.now(),
          });
          bell();
          break;
        }
      }
    }

    // ── Error spike: 3+ errors in last 10 actions ──
    if (!fired.errorSpike) {
      const lastN = stats.events.slice(-10);
      const errors = lastN.filter((e) => e.outcome === "error").length;
      if (errors >= 3) {
        fired.errorSpike = true;
        newAlerts.push({
          id: "error-spike",
          severity: "warning",
          title: `${errors} errors in last 10 actions`,
          detail: "Paste the exact error and restate your goal",
          timestamp: Date.now(),
        });
        bell();
      }
    }

    // ── Read loop: same file read 5+ times ──
    if (!fired.readLoop) {
      const readCounts = new Map<string, number>();
      for (const event of stats.events) {
        if (event.toolName === "Read" && event.filePath) {
          readCounts.set(event.filePath, (readCounts.get(event.filePath) ?? 0) + 1);
        }
      }
      for (const [file, count] of readCounts) {
        if (count >= 5) {
          fired.readLoop = true;
          newAlerts.push({
            id: "read-loop",
            severity: "info",
            title: "Repeated reads detected",
            detail: `${file} read ${count} times — AI may have lost context`,
            timestamp: Date.now(),
          });
          break;
        }
      }
    }

    if (newAlerts.length > 0) {
      setAlerts((prev) => [...prev, ...newAlerts]);
      setLatestAlert(newAlerts[newAlerts.length - 1] ?? null);
    }
  }, [stats]);

  const dismissLatest = (): void => {
    setLatestAlert(null);
  };

  return { alerts, latestAlert, dismissLatest };
}
