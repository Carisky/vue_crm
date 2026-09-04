import "dotenv/config";
import { reconcileMattermostWithRuntime } from "../server/lib/mattermost/reconcile.ts";

reconcileMattermostWithRuntime()
  .then((summary) => {
    process.stdout.write(`${JSON.stringify(summary ?? { disabled: true })}\n`);
  })
  .catch((error: unknown) => {
    const message =
      error instanceof Error
        ? error.message.split(/\r?\n/, 1)[0]
        : "Reconciliation failed";
    process.stderr.write(
      `Mattermost reconciliation failed: ${message.slice(0, 500)}\n`,
    );
    process.exitCode = 1;
  });
