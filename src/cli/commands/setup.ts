import chalk from "chalk";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export async function runSetup(target?: string): Promise<void> {
  if (!target || target === "help") {
    console.log("");
    console.log(chalk.bold("  Rasad Setup — integrate with your tools"));
    console.log("");
    console.log("  Available integrations:");
    console.log(`    ${chalk.cyan("rasad setup hooks")}    Install CC session-end hook (auto summary after every session)`);
    console.log(`    ${chalk.cyan("rasad setup shell")}    Add daily stats to terminal startup`);
    console.log(`    ${chalk.cyan("rasad setup all")}      Install everything`);
    console.log("");
    console.log(`    ${chalk.cyan("rasad setup remove")}   Remove all integrations`);
    console.log("");
    return;
  }

  if (target === "all") {
    await setupCCHooks();
    await setupShell();
    return;
  }

  if (target === "hooks") {
    await setupCCHooks();
    return;
  }

  if (target === "shell") {
    await setupShell();
    return;
  }

  if (target === "remove") {
    await removeCCHooks();
    await removeShell();
    return;
  }

  console.log(chalk.red(`  Unknown target: ${target}. Run rasad setup for help.`));
}

async function setupCCHooks(): Promise<void> {
  const ccSettings = join(homedir(), ".claude", "settings.json");
  const scriptsDir = join(homedir(), ".claude", "scripts");

  if (!existsSync(join(homedir(), ".claude"))) {
    console.log(chalk.yellow("  Claude Code not detected — skipping hook setup"));
    return;
  }

  // Create the hook script
  mkdirSync(scriptsDir, { recursive: true });
  const hookScript = join(scriptsDir, "rasad-session-end.sh");

  writeFileSync(hookScript, `#!/bin/bash
# Rasad — auto session summary after CC session ends
# Installed by: rasad setup hooks

# Quick sync + show grade (non-blocking, silent if rasad not installed)
if command -v rasad &>/dev/null || command -v npx &>/dev/null; then
  (
    # Sync latest session data
    rasad sync 2>/dev/null || npx -y rasad sync 2>/dev/null

    # Find the most recent session
    SESSION_ID=$(ls -t ~/.claude/projects/*/?.jsonl 2>/dev/null | head -1 | xargs basename 2>/dev/null | sed 's/.jsonl//' | cut -c1-8)

    if [ -n "$SESSION_ID" ]; then
      # Show quick quality grade
      echo ""
      echo "  \\x1b[1m🔭 Rasad Session Report\\x1b[0m"
      rasad quality "$SESSION_ID" 2>/dev/null | head -15 || true

      # Show top recommendation if any
      rasad recommend 2>/dev/null | head -5 | tail -3 || true
      echo ""
    fi
  ) &
fi
`, { mode: 0o755 });

  // Add to CC settings.json
  let settings: Record<string, unknown> = {};
  if (existsSync(ccSettings)) {
    try { settings = JSON.parse(readFileSync(ccSettings, "utf-8")) as Record<string, unknown>; } catch { /* start fresh */ }
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
  const stopHooks = (hooks.Stop ?? []) as Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>;

  // Check if already installed
  const alreadyInstalled = stopHooks.some((h) =>
    h.hooks?.some((hk) => hk.command?.includes("rasad-session-end"))
  );

  if (!alreadyInstalled) {
    stopHooks.push({
      matcher: "",
      hooks: [{ type: "command", command: `bash ${hookScript} 2>/dev/null || true` }],
    });
    hooks.Stop = stopHooks;
    settings.hooks = hooks;
    writeFileSync(ccSettings, JSON.stringify(settings, null, 2));
    console.log(chalk.green("  ✓ CC Stop hook installed — session summary will show after every session"));
  } else {
    console.log(chalk.dim("  CC hook already installed"));
  }

  console.log(chalk.dim(`    Script: ${hookScript}`));
}

async function setupShell(): Promise<void> {
  const shell = process.env.SHELL ?? "/bin/zsh";
  const rcFile = shell.includes("zsh")
    ? join(homedir(), ".zshrc")
    : join(homedir(), ".bashrc");

  const marker = "# Rasad — AI Observatory daily stats";
  const snippet = `
${marker}
if command -v rasad &>/dev/null; then
  rasad 2>/dev/null
fi
`;

  if (existsSync(rcFile)) {
    const content = readFileSync(rcFile, "utf-8");
    if (content.includes(marker)) {
      console.log(chalk.dim("  Shell integration already installed"));
      return;
    }
  }

  writeFileSync(rcFile, (existsSync(rcFile) ? readFileSync(rcFile, "utf-8") : "") + snippet);
  console.log(chalk.green(`  ✓ Shell integration added to ${rcFile}`));
  console.log(chalk.dim("    Daily AI stats will show when you open a new terminal"));
  console.log(chalk.dim(`    Restart your shell or run: source ${rcFile}`));
}

async function removeCCHooks(): Promise<void> {
  const ccSettings = join(homedir(), ".claude", "settings.json");
  if (!existsSync(ccSettings)) return;

  try {
    const settings = JSON.parse(readFileSync(ccSettings, "utf-8")) as Record<string, unknown>;
    const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
    const stopHooks = (hooks.Stop ?? []) as Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>;

    const filtered = stopHooks.filter((h) =>
      !h.hooks?.some((hk) => hk.command?.includes("rasad-session-end"))
    );

    if (filtered.length !== stopHooks.length) {
      hooks.Stop = filtered;
      settings.hooks = hooks;
      writeFileSync(ccSettings, JSON.stringify(settings, null, 2));
      console.log(chalk.green("  ✓ CC hook removed"));
    }
  } catch { /* skip */ }
}

async function removeShell(): Promise<void> {
  const marker = "# Rasad — AI Observatory daily stats";
  for (const rc of [".zshrc", ".bashrc"]) {
    const rcFile = join(homedir(), rc);
    if (!existsSync(rcFile)) continue;

    const content = readFileSync(rcFile, "utf-8");
    if (content.includes(marker)) {
      // Remove the rasad block (marker + next 3 lines)
      const lines = content.split("\n");
      const idx = lines.findIndex((l) => l.includes(marker));
      if (idx >= 0) {
        lines.splice(idx, 4); // marker + if + rasad + fi
        writeFileSync(rcFile, lines.join("\n"));
        console.log(chalk.green(`  ✓ Shell integration removed from ~/${rc}`));
      }
    }
  }
}
