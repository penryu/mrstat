# mrstat

## Description

Polls the GitLab API for open MRs in a given project.

If MR authors are provided, will only return MRs authored by those users.

## Configuration

`mrstat` needs some information about your GitLab project from a file at
`~/.mrstat.json`. Here is an example configuration blob:

```json
{
  "api_token": "SECRET",
  "authors": {
    "alice": 1010,
    "bob": 1011,
    "cathy": 1100,
    "dora": 1101,
    "edgar": 1459
  },
  "project_id": 12345678,
  "target_branch": "master"
}
```

### `api_token`

The `api_token` is issued by GitLab from your user profile. See [Personal Access
Tokens](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html).

### `authors`

`authors` is an object (specifically: `Record<string, number>`) that maps a
users' friendly namels to their GitLab user IDs.

If provided, only MRs authored by these users will be returned.

If this object is missing or empty, _all_ open MRs in the project will be
returned.

Note that `mrstat` only uses the values on this object. The keys are solely to
make managing uids more manageable.

### `project_id`

The `project_id` can be found in the *Settings* for your GitLab project.

### `target_branch`

Only MRs whose target branch matches this value will be returned.

If not given, `target_branch` defaults to `main`, but can be overridden if
desired. E.g., `master` or `wip`.

## Usage

To run in-place using ts-node:

```sh
yarn install
yarn dev
```

To build a single, minified `.js` file for use with `node`:

```sh
yarn build
node dist/index.js
```

To install the compiled `.js` file for general use:

```sh
yarn build
cp dist/index.js /usr/local/bin/mrstat
mrstat
```

You can replace `/usr/local/bin/` with any directory in the `$PATH` you prefer.

## Example

```sh
$ yarn install
yarn install v1.22.18
[1/4] 🔍  Resolving packages...
[2/4] 🚚  Fetching packages...
[3/4] 🔗  Linking dependencies...
[4/4] 🔨  Building fresh packages...
✨  Done in 0.87s.

$ yarn build
yarn run v1.22.18
$ ncc build src/index.ts --minify
ncc: Version 0.33.3
ncc: Compiling file index.js into CJS
ncc: Using typescript@4.6.3 (local user-provided)
5kB  dist/index.js
5kB  [2388ms] - ncc 0.33.3
✨  Done in 2.69s.

$ ./dist/index.js
[    0ms] Checking for configuration file /Users/edgar/.mrstat.json
[    2ms] Loaded configuration {
  authors: {
    edgar: 1459
  },
  project_id: 12345678,
  target_branch: 'main'
}
[    4ms] /merge_requests?scope=all&state=opened&target_branch=main - requesting...
[  529ms] /merge_requests?scope=all&state=opened&target_branch=main - received 54751 bytes.
[  529ms] /merge_requests/2855/approvals - requesting...
[  530ms] /merge_requests/2827/approvals - requesting...
[ 1113ms] /merge_requests/2855/approvals - received 13252 bytes.
[ 1324ms] /merge_requests/2827/approvals - received 13444 bytes.

Output can safely be piped to clipboard.

E.g., for macOS: mrstat | pbcopy

===== BEGIN MARKDOWN =====

*Open MRs against main:*
* *Ready to Merge*
    * [feat: make feature work on mobile #no-issue](https://gitlab.com/yourco/your-project/-/merge_requests/27) (thammerquist)
* *Blocked*
    * [feat: disable animations [GDZ-18]](https://gitlab.com/yourco/your-project/-/merge_requests/28) (thammerquist)
        * requires approval (1)

===== END MARKDOWN =====

$
```
