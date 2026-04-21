export const TOOL_HUMAN: Record<string, { icon: string; label: string }> = {
  Bash:       { icon: "$", label: "Running command" },
  Read:       { icon: " ", label: "Reading" },
  Edit:       { icon: " ", label: "Editing" },
  Write:      { icon: " ", label: "Creating" },
  Grep:       { icon: " ", label: "Searching" },
  Glob:       { icon: " ", label: "Finding files" },
  Agent:      { icon: " ", label: "Launching agent" },
  WebFetch:   { icon: " ", label: "Fetching web" },
  WebSearch:  { icon: " ", label: "Searching web" },
  TaskCreate: { icon: " ", label: "Creating task" },
  TaskUpdate: { icon: " ", label: "Updating task" },
  Skill:      { icon: " ", label: "Running skill" },
};

/** Shorten MCP tool names: mcp__plugin_supabase_supabase__execute_sql → supabase:execute_sql */
export function shortToolName(name: string): string {
  if (name.startsWith("mcp__")) {
    const parts = name.replace(/^mcp__plugin_[^_]+_/, "").replace(/__/g, ":");
    return parts.length > 20 ? parts.slice(0, 20) : parts;
  }
  return name;
}

/** Truncate multi-line string to N lines for display */
export function truncLines(s: string, maxLines: number): string {
  const lines = s.split("\n");
  if (lines.length <= maxLines) return s;
  return lines.slice(0, maxLines).join("\n") + `\n… (${lines.length - maxLines} more lines)`;
}

export interface XRayMeta {
  detail: string;
  filePath?: string;
  oldContent?: string;
  newContent?: string;
  oldLineCount?: number;
  newLineCount?: number;
  writeContent?: string;
  writeLineCount?: number;
  bashCommand?: string;
  searchPattern?: string;
}

export function extractXRayMeta(name: string, input: Record<string, unknown> | undefined): XRayMeta {
  if (!input) return { detail: "" };
  const filePath = typeof input.file_path === "string" ? input.file_path as string : undefined;
  const shortPath = filePath ? filePath.split("/").slice(-2).join("/") : undefined;

  if (name === "Edit" && filePath) {
    const oldStr = typeof input.old_string === "string" ? input.old_string as string : "";
    const newStr = typeof input.new_string === "string" ? input.new_string as string : "";
    return {
      detail: shortPath ?? "", filePath,
      oldContent: truncLines(oldStr, 15), newContent: truncLines(newStr, 15),
      oldLineCount: oldStr.split("\n").length, newLineCount: newStr.split("\n").length,
    };
  }
  if (name === "Write" && filePath) {
    const content = typeof input.content === "string" ? input.content as string : "";
    const lineCount = content.split("\n").length;
    return { detail: shortPath ?? "", filePath, writeContent: truncLines(content, 15), writeLineCount: lineCount };
  }
  if (name === "Read" && filePath) return { detail: shortPath ?? "", filePath };
  if (name === "Bash" && typeof input.command === "string") return { detail: (input.command as string).slice(0, 80), bashCommand: input.command as string };
  if ((name === "Grep" || name === "Glob") && typeof input.pattern === "string") return { detail: `"${(input.pattern as string).slice(0, 50)}"`, searchPattern: input.pattern as string };
  if (filePath) return { detail: shortPath ?? "", filePath };
  if (typeof input.prompt === "string") return { detail: (input.prompt as string).slice(0, 50) };
  if (typeof input.description === "string") return { detail: (input.description as string).slice(0, 50) };
  if (typeof input.subject === "string") return { detail: (input.subject as string).slice(0, 50) };
  return { detail: "" };
}
