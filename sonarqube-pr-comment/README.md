# sonarqube-pr-comment

This action fetches analysis data from SonarQube and posts a single comment to the PR, updating it on
re-runs. The comment holds the quality gate conditions as a table, a table of open Blocker/High issues
and vulnerabilities (whole project, each linked to the file on GitHub and to SonarQube) and the dashboard links.
It respects HTTP_PROXY variables.

Loosely based on https://github.com/campos-pay/sonarqube-pr-comment

## Usage

See [example-use.yml](example-use.yml)

### Inputs
All of them are required.
- `sonar_host_url` - address under which the workflow runner can reach SonarQube
- `sonar_public_host_url` - user-facing SonarQube address, used in comment links
- `sonar_token` - token used to communicate with `sonar_host_url`.
- `github_token` - token used by this job to post comment in PR. Should be set to `${{ secrets.GITHUB_TOKEN }}` in most cases
- `repo_name` - Repository name. Should be set to `${{ github.repository }}`
- `pr_number` - PR number where the comment should be posted. Should be set to `${{ github.event.pull_request.number }}` in most cases

## Version history

### 1.0.5
- Comment body is markdown: quality gate conditions table, open findings table (Blocker/High issues and vulnerabilities) with links to GitHub and SonarQube, dashboard links
- Findings are listed until the comment nears GitHub's size limit; the rest is counted
- A re-run updates the comment left by the previous run instead of adding another one

### 1.0.4
Initial release