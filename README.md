# mServices GitHub Actions Repository

Shared CI building blocks for mServices repositories: composite actions, each
with a ready-to-copy example. For details, see the README inside each action's
folder.

## Versioning

This repository is automatically tagged with the `latest` tag on newest commits.
`latest` is intended for testing only — please reference version tags
(e.g. `v1.0.0`) from your repositories.

## Using the actions from another organization

This repository is private and shared between two GitHub organizations. A
repository in the same organization can reference actions directly:

```yaml
- uses: mservicestech/actions/node-vulnerability-scan@latest
```

A repository in the other organization cannot (the built-in `GITHUB_TOKEN`
cannot read another org's private repo) — check this repository out with a
personal access token and use the action from the local path instead:

```yaml
- name: Checkout shared actions
  uses: actions/checkout@v4
  with:
    repository: mservicestech/actions
    ref: latest
    path: .shared-actions
    token: ${{ secrets.WORKFLOW_DISPATCH_PERSONAL_ACCESS_TOKEN }}

- uses: ./.shared-actions/node-vulnerability-scan
```

Copy-paste-ready caller workflows are in [`examples/`](examples).

## Actions

### [node-vulnerability-scan](node-vulnerability-scan)

Installs dependencies with Yarn (Classic and Berry are both supported) and
audits them for known vulnerabilities. Fails when anything at or above the
severity threshold is found and lists the CVE / GHSA identifiers in the log
and job summary.

Inputs (all optional): `yarn-lock-path` (default `yarn.lock`), `node-version`
(default `lts/*` — the latest LTS), `severity` (`info`/`low`/`moderate`/`high`/`critical`,
default `high`), `npm-token` (for private-registry installs).

Example: [examples/node-vulnerability-scan.yml](examples/node-vulnerability-scan.yml)

### [upload-to-bucket](upload-to-bucket)

Uploads a folder to a GCS bucket into a timestamped directory and returns its
path. Authenticates to GCP via Workload Identity Federation.

### [delete-from-bucket](delete-from-bucket)

Deletes a directory from a GCS bucket by date prefix and/or removes stale
directories older than a given number of days.

## Contributing

Rules for adding new actions — reusability, examples and documentation
requirements — are described in [CONTRIBUTING.md](CONTRIBUTING.md).
