import { MergeRequest } from './gitlab';

/**
 * Logs arguments to stderr.
 * Includes a timestamp of milliseconds since program start.
 *
 * @param {...*} ...args - values to log
 */
export function log(...args: unknown[]): void {
  const delta = Date.now() - log.start;
  console.warn(`[${delta.toString().padStart(5)}ms]`, ...args);
}
log.start = Date.now();

/**
 * Formats a `MergeRequest` for display in Slack-style markdown.
 *
 * @param {string} header - used as section header
 * @param {Array<MergeRequest>} mrs - list of MRs to display
 * @returns {string} Slack-formatted text
 */
export function formatMRs(header: string, mrs: ReadonlyArray<MergeRequest>): string {
  const output = [`* *${header}*\n`];

  for (const mr of mrs) {
    output.push(`    * [${mr.title}](${mr.web_url}) (${mr.author.username})\n`);

    if (mr.labels.length > 0) {
      output.push(`        * Labels: ${mr.labels.join(", ")}\n`);
    }

    if (mr.blockers.length > 0) {
      output.push(`        * ${mr.blockers.join(", ")}\n`);
    }
  }

  return output.join("");
}

export function groupBy<T, K, F extends (arg0: T) => K>(f: F, xs: ReadonlyArray<T>): Map<K, Array<T>> {
  const m = new Map<K, Array<T>>();

  for (const x of xs) {
    const key = f(x);

    if (m.has(key)) {
      m.get(key)?.push(x);
    } else {
      m.set(key, [x]);
    }
  }

  return m;
}

