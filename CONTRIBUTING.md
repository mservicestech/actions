# Contributing

This repository is shared CI infrastructure consumed by repositories in two
GitHub organizations. Everything added here must be generic, documented and
safe to reference from other repositories.

## Pull requests

All changes go through a pull request — never commit or push directly to
`master`. A pull request requires an approval from a reviewer before it can be
merged. Keep in mind that merging to `master` immediately moves the `latest`
tag, so a pull request must leave the repository in a working state.

## Rules for new workflows

1. **It must be reusable.** New CI logic is added as a **composite action** —
   an `action.yml` in its own top-level folder. Nothing repository-specific:
   no hardcoded project paths, registries or organization names inside the
   logic — make them inputs.

   Prefer composite actions over `workflow_call` reusable workflows: this
   repository is private and shared across two organizations on the Team
   plan, and the second organization can only consume it by checking the repo
   out with a PAT and using actions from the local path (`uses: ./…`).
   Reusable workflows cannot be called from a checkout, so they would only
   work for one of the two organizations.

2. **It must have an example.** Add a copy-paste-ready caller workflow to
   [`examples/`](examples), named after the action it demonstrates
   (e.g. `examples/node-vulnerability-scan.yml`). Show the cross-org
   PAT-checkout call and, where useful, an advanced variant (matrix, pinned
   versions).

3. **It must be described in [README.md](README.md)** — a one-paragraph
   description, the inputs with their defaults, and a link to the example —
   and have a README in its folder with inputs, outputs and version history.

## Conventions

- **Inputs over hardcoding.** Every knob is an input with a sensible default,
  so the minimal call needs no configuration at all. When a value has a fixed
  set of options (a "dropdown"), validate it in the first step and fail with
  an `::error::` annotation on anything else.
- **Tokens are inputs.** Composite actions have no `secrets` block — accept
  tokens as inputs (e.g. `npm-token`) and let callers pass
  `${{ secrets.… }}`. Never commit secrets or organization internals to this
  repository.
- **Fail early and clearly.** Validate inputs in the first step; use
  `::error::` annotations and write results to `$GITHUB_STEP_SUMMARY` where it
  helps reviewers.
- **Shell discipline.** Every `run:` step declares `shell: bash` (required in
  composite actions) and starts with `set -euo pipefail`; pass dynamic values
  through `env:` rather than interpolating `${{ }}` into scripts.
- **Pin action versions.** Reference third-party actions by major version tag
  at minimum (e.g. `actions/checkout@v4`).

## Testing and releasing

- Self-test workflows are prefixed with `99.` (see
  `.github/workflows/test-upload-to-bucket.yml`) and run via
  `workflow_dispatch`. Run the relevant one before merging changes to an
  action it covers.
- Every push to `master` force-moves the `latest` tag automatically. Use
  `latest` only for testing; create/move a version tag (e.g. `v1`) for
  consumers once a change is verified, and note the change in the action's
  folder README version history.
