import React from "react";
import { render } from "ink";
import { App } from "../../tui/App.js";

/**
 * Buffer stdout writes so Ink's multi-write render cycle
 * flushes as a single atomic write — eliminates visible flicker.
 */
function patchStdoutBuffering(): () => void {
  const original = process.stdout.write.bind(process.stdout);
  let buffer = "";
  let scheduled: NodeJS.Immediate | null = null;

  process.stdout.write = function (chunk: string | Uint8Array, ...args: unknown[]): boolean {
    buffer += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    if (!scheduled) {
      scheduled = setImmediate(() => {
        scheduled = null;
        const frame = buffer;
        buffer = "";
        original(frame);
      });
    }
    return true;
  } as typeof process.stdout.write;

  return () => {
    process.stdout.write = original;
    if (scheduled) clearImmediate(scheduled);
    if (buffer) original(buffer);
  };
}

export async function runWatch(): Promise<void> {
  const restore = patchStdoutBuffering();

  const { waitUntilExit, unmount } = render(
    React.createElement(App, {
      onExit: () => {
        restore();
        unmount();
        process.exit(0);
      },
    }),
    { exitOnCtrlC: false }
  );

  await waitUntilExit();
  restore();
}
