import { IncomingMessage } from 'http';
import { RequestOptions, get as httpsGet } from 'https';

import { log } from './util';

/**
 * GitLab API types
 *
 * Most of these are taken from thes GitLab API docs:
 *
 * https://docs.gitlab.com/ee/api/merge_requests.html#list-project-merge-requests
 * https://docs.gitlab.com/ee/api/merge_request_approvals.html#get-configuration-1
 */

/*
 * Type aliases
 */

export type MRState = "closed" | "merged" | "open";

export type MergeStatus =
  | "unchecked"
  | "checking"
  | "can_be_merged"
  | "cannot_be_merged"
  | "cannot_be_merged_recheck";

/*
 * Interfaces
 */

interface Author {
  readonly id: number;
  readonly name: string;
  readonly username: string;
}

interface MRApprovalStatus {
  readonly approvals_required: number;
  readonly approvals_left: number;
  readonly id: number;
  readonly iid: number;
  readonly project_id: number;
  readonly title: string;
}

export interface MergeRequest {
  approvals_needed: number;
  readonly author: Author;
  blockers: Array<string>;
  readonly blocking_discussions_resolved: boolean;
  readonly draft: boolean;
  readonly has_conflicts: boolean;
  readonly iid: number;
  readonly labels: Array<string>;
  readonly merge_status: MergeStatus;
  readonly source_branch: string;
  readonly state: MRState;
  readonly title: string;
  readonly web_url: string;
  readonly work_in_progress: boolean;
}

export interface GitLabConfig {
  readonly api_token: string;
  readonly target_branch?: string;
  readonly authors: Record<string, number>;
  readonly project_id: number;
}

export class GitLab implements Omit<GitLabConfig, "api_token"> {
  static readonly GITLAB_API_BASE = "https://gitlab.com/api/v4";

  readonly #api_token: string;
  readonly authors: Record<string, number>;
  readonly project_id: number;
  readonly target_branch: string;

  constructor(config: GitLabConfig) {
    // Ensure configuration includes required fields
    if (!config?.api_token)
      throw new Error(
        `missing \`api_token\`: see https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html`
      );

    if (!config?.project_id)
      throw new Error(
        `missing \`project_id\`: you can find Project ID in your project settings`
      );

    if (!config?.authors || Object.entries(config.authors).length < 1) {
      console.warn(`missing or empty property \`authors\``);
      console.warn("all open project MRs will be returned");
    }

    if (!config?.target_branch) {
      console.warn(`Configuration missing branch name; defaulting to main`);
    }

    this.#api_token = config.api_token;
    this.authors = config.authors ?? [];
    this.project_id = config.project_id;
    this.target_branch = config?.target_branch ?? "main";
  }

  /**
   * Queries GitLab for open MRs on the given branch.
   * If authors were provided, restricts MRs authored by those users.
   *
   * @returns {MergeRequest[]} Array of all matching MRs
   */
  async openMergeRequests(): Promise<Array<MergeRequest>> {
    const all_mrs = await this.#get<MergeRequest[]>("/merge_requests", {
      scope: "all",
      state: "opened",
      target_branch: this.target_branch,
    });

    const author_ids = Object.values(this.authors);
    const mrs =
      author_ids.length > 0
        ? all_mrs.filter((mr: MergeRequest) =>
            author_ids.includes(mr.author.id)
          )
        : all_mrs;

    // GitLab API is slow (~1-2s/req), so parallelize
    // the secondary requests for approval data.
    await Promise.all(
      mrs.map(async (mr: MergeRequest) =>
        this.#get<MRApprovalStatus>(`/merge_requests/${mr.iid}/approvals`).then(
          (approvals) => {
            mr.approvals_needed = approvals.approvals_left;
            mr.blockers = GitLab.#findBlockers(mr);
          }
        )
      )
    );

    return mrs;
  }

  /**
   * Analyzes the fields of the `MergeRequest` to look for conditions blocking
   * the merging of the MR, and updates the `MergeRequest` object.
   *
   * @param {MergeRequest} mr - MR to derive blockers from
   * @returns {string[]} Array of blockers; if empty, no blockers were found
   */
  static #findBlockers(mr: MergeRequest): Array<string> {
    const {
      blocking_discussions_resolved: threads_resolved,
      has_conflicts,
      merge_status,
      approvals_needed,
    } = mr;
    const blockers = [];

    if (!threads_resolved) blockers.push("unresolved threads");
    if (has_conflicts) blockers.push("has conflicts");
    if (merge_status.includes("cannot_be_merged"))
      blockers.push("cannot be merged");
    if (approvals_needed > 0)
      blockers.push(`requires approval (${approvals_needed})`);

    return blockers;
  }

  /**
   * Makes GitLab API request and wraps it in a Promise
   *
   * @param {string} uri - GitLab API URI; appended to base URL
   * @param {Record<string, string>} params: optional URL query parameters
   * @returns {Promise<T>} API result as the requested type
   */
  async #get<T>(
    uri: string,
    params?: Record<string, string>
  ): Promise<T> {
    const baseURL = `${GitLab.GITLAB_API_BASE}/projects/${this.project_id}`;
    const url = new URL(`${baseURL}${uri}`);
    url.search = new URLSearchParams(params).toString();

    const logUrl = url.toString().slice(baseURL.length);
    log(`${logUrl} - requesting...`);

    const options: RequestOptions = {
      headers: { authorization: `Bearer ${this.#api_token}` },
    };

    return new Promise((resolve, reject) => {
      const req = httpsGet(url, options, (res: IncomingMessage) => {
        const { statusCode } = res;
        if (statusCode && (statusCode < 200 || statusCode >= 300)) {
          return reject(new Error(`statusCode=${statusCode}`));
        }

        const chunks: Uint8Array[] = [];
        res.on("data", (chunk: Uint8Array) => chunks.push(chunk));
        res.on("end", () => {
          const data = Buffer.concat(chunks).toString();
          let result;
          try {
            result = JSON.parse(data);
          } catch (e) {
            reject(e);
          }
          log(`${logUrl} - received ${data.length} bytes.`);
          resolve(result);
        });
      });
      req.on("error", reject);
      req.end();
    });
  }
}
