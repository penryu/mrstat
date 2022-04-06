#!/usr/bin/env node

import { readFile } from "fs/promises";
import { env, stdout } from "process";

import { GitLab } from "./gitlab";
import { formatMRs, groupBy, log } from "./util";

const RC_FILE = "~/.mrstat.json";

async function main() {
  const path = RC_FILE.replace("~", env["HOME"] ?? "");
  log(`Checking for configuration file ${path}`);

  const gitlab = await readFile(path, { encoding: "utf8" }).then((content) => {
    const config = JSON.parse(content);
    return new GitLab(config);
  });
  log(gitlab);

  const mrs = groupBy(
    (mr) => (mr.blockers.length > 0 ? "blocked" : "ready"),
    await gitlab.openMergeRequests()
  );

  // These assertions are fine. `get()` will succeed if `has()` is true.
  /* eslint @typescript-eslint/no-non-null-assertion: off */
  const output = [
    `\n*Open MRs against \`${gitlab.target_branch}\`:*\n`,
    mrs.has("ready") && formatMRs("Ready to Merge", mrs.get("ready")!),
    mrs.has("blocked") && formatMRs("Blocked", mrs.get("blocked")!),
  ]
    .filter(Boolean)
    .join("");

  console.warn("\nOutput can safely be piped to clipboard.\n");
  console.warn(`E.g., for macOS: mrstat | pbcopy\n`);

  // `log` writes to stderr so that only the ouput is written to stdout.
  // This makes it easier to pipe to `pbcopy`.
  //
  // If the output is not piped (`stdout.isTTY === true`), write BEGIN/END
  // markers to make it easier to see/copy with the mouse.
  if (stdout.isTTY) console.warn("===== BEGIN MARKDOWN =====");
  console.log(output);
  if (stdout.isTTY) console.warn("===== END MARKDOWN =====\n");
}

main().catch((err) => console.error(err.message));
