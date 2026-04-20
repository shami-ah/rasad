import React from "react";
import { render } from "ink";
import { App } from "../../tui/App.js";

export async function runWatch(): Promise<void> {
  const { waitUntilExit, unmount } = render(
    React.createElement(App, {
      onExit: () => {
        unmount();
        process.exit(0);
      },
    }),
    { exitOnCtrlC: false }
  );

  await waitUntilExit();
}
