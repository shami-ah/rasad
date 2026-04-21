import chalk from "chalk";

/** Simple CLI logger — colored output to stdout, errors to stderr. */
export const log = {
  info: (msg: string): void => { process.stdout.write(`  ${msg}\n`); },
  success: (msg: string): void => { process.stdout.write(`  ${chalk.green("✓")} ${msg}\n`); },
  warn: (msg: string): void => { process.stdout.write(`  ${chalk.yellow("!")} ${msg}\n`); },
  error: (msg: string): void => { process.stderr.write(`  ${chalk.red("✗")} ${msg}\n`); },
  header: (msg: string): void => { process.stdout.write(`\n  ${chalk.bold(msg)}\n\n`); },
  dim: (msg: string): void => { process.stdout.write(`  ${chalk.dim(msg)}\n`); },
  blank: (): void => { process.stdout.write("\n"); },
};
