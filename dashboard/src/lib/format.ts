/** Shared formatting utilities for the Rasad dashboard. */

import type { Session } from "./api";

/** Format milliseconds into a human-readable duration. */
export function formatDuration(ms: number | undefined | null): string {
  if (ms === undefined || ms === null || isNaN(ms) || ms <= 0) return "<1m";
  if (ms < 60_000) return "<1m";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Format an ISO timestamp into HH:MM local time. */
export function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch { return ""; }
}

/**
 * Shorten a model name for display.
 * Handles Claude, OpenAI, Groq, and generic models.
 */
export function shortModel(model: string | null): string {
  if (!model) return "";
  // Provider-prefixed: "openai/gpt-4" → "gpt-4", "groq/qwen/qwen3-32b" → "qwen3-32b"
  if (model.includes("/")) {
    const parts = model.split("/");
    return parts[parts.length - 1] ?? model;
  }
  // Claude: "claude-opus-4-6-20250805" → "opus-4-6"
  return model.replace("claude-", "").replace(/-\d{8}$/, "");
}

/**
 * Extract a clean project name from a session.
 * Uses cwd (actual directory) as primary, falls back to project field.
 */
export function getProjectName(session: { cwd?: string; project: string }): string {
  // Use cwd if available — it's the real working directory
  if (session.cwd) {
    const parts = session.cwd.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? session.project;
  }
  return decodeProject(session.project);
}

/** Fallback decoder for project field only (when cwd not available). */
export function decodeProject(project: string): string {
  if (!project) return "";
  if (project.includes("/")) return project.split("/").pop() ?? project;
  // Claude Code encoded paths: "Users-shami-Work-rasad"
  // We know the pattern is: Users-<username>[-path-segments]
  if (project.startsWith("Users-") || project.startsWith("users-")) {
    const parts = project.split("-");
    // "Users-shami" → just "shami" (2 parts)
    if (parts.length <= 2) return parts[parts.length - 1] ?? project;
    // "Users-shami-Work-rasad" → skip Users and username, rejoin rest
    return parts.slice(2).join("-");
  }
  return project;
}

/**
 * Compute duration from session fields — works even if API hasn't been updated.
 * Returns duration_ms if present, otherwise computes from timestamps.
 */
export function getSessionDuration(s: Session): number {
  if (s.duration_ms && !isNaN(s.duration_ms) && s.duration_ms > 0) return s.duration_ms;
  if (s.ended_at && s.started_at) {
    const d = new Date(s.ended_at).getTime() - new Date(s.started_at).getTime();
    return isNaN(d) ? 0 : d;
  }
  if (s.started_at) {
    const d = Date.now() - new Date(s.started_at).getTime();
    return isNaN(d) ? 0 : d;
  }
  return 0;
}

/** Get session status — works even without enriched API. */
export function getSessionStatus(s: Session): "active" | "completed" {
  if (s.status) return s.status;
  return s.ended_at ? "completed" : "active";
}

/** Get tool call count with fallback. */
export function getToolCount(s: Session): number | null {
  if (typeof s.tool_call_count === "number") return s.tool_call_count;
  return null;
}
