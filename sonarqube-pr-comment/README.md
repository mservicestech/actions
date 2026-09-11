# sonarqube-pr-comment

This action fetches analysis data from SonarQube and posts a comment to PR. It respects HTTP_PROXY variables.

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

### 1.0.4
Initial release