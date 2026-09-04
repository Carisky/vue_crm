import "dotenv/config";
import { getMattermostStatusWithRuntime } from "../server/lib/mattermost/status.ts";

getMattermostStatusWithRuntime()
  .then((status) =>
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`),
  )
  .catch((error: unknown) => {
    const message =
      error instanceof Error
        ? error.message.split(/\r?\n/, 1)[0]
        : "Status failed";
    process.stderr.write(
      `Mattermost status failed: ${message.slice(0, 500)}\n`,
    );
    process.exitCode = 1;
  });
