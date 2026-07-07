# CLAUDE.md

Shared GitHub Actions repository (`mservicestech/actions`) consumed by
repositories in two GitHub organizations on the Team plan. The repo is
private: same-org callers reference actions directly
(`uses: mservicestech/actions/<name>@tag`); the other org checks the repo out
with a PAT and uses actions from the local path (`uses: ./…`). Because of
that, new CI logic is written as **composite actions**, not `workflow_call`
reusable workflows — those cannot be called from a checkout. No secrets,
tokens or org internals in any file.

## Layout

- `<action-name>/` — composite actions, each with `action.yml`, a README
  (inputs, outputs, version history) and `example-use.yml` — a copy-paste
  ready caller workflow demonstrating the cross-org PAT-checkout pattern.
- `.github/workflows/` — repo maintenance only: `tag-latest.yml` and
  self-tests (prefixed `99.`, run via workflow_dispatch).

## Rules (full version in CONTRIBUTING.md)

All changes require a pull request with an approval — never commit directly
to `master` (merging moves the `latest` tag immediately).

Every new action must be reusable (all configuration via inputs with
defaults, tokens as inputs since composite actions have no `secrets` block),
must ship an `example-use.yml` in its folder, and must get a section in
`README.md`.
Enum-like inputs are validated in the first step with an `::error::`
annotation on invalid values.

Style: every `run:` step declares `shell: bash` and uses `set -euo pipefail`,
dynamic values via `env:` rather than `${{ }}` interpolated into scripts,
pinned action versions.

## Verifying changes

- No linter is installed locally; parse-check YAML with:
  `ruby -ryaml -e "YAML.load_file('<file>')"` (system Python has no PyYAML).
- Action changes covered by a `99.` self-test workflow are verified by
  dispatching it on GitHub.

## Releasing

Push to `master` auto-moves the `latest` tag (testing only). Consumers
reference version tags (e.g. `@v1`), moved manually once verified.
