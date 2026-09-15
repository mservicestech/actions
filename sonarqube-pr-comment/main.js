'use strict';

const fs = require('fs');
const path = require('path');

const GITHUB_API_BASE_URL = 'https://api.github.com';
const SONAR_PROPERTIES_PATH = path.join(process.env.GITHUB_WORKSPACE || process.cwd(), 'sonar-project.properties');

// Hidden first line of the comment; a re-run looks for it to update its own comment instead of adding another.
const COMMENT_MARKER = '<!-- sonarqube-pr-comment -->';
// GitHub rejects comment bodies over 65 536 characters; findings rows are added until this budget is used up.
const COMMENT_LENGTH_BUDGET = 60000;
const SEVERITY_ORDER = ['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
const COMPARATORS = { GT: '>', LT: '<', EQ: '=', NE: '≠' };

// Used only to build the "GitHub" links of the findings: <server>/<repo>/blob/<PR branch>/<path>#L<line>
const GITHUB_SERVER_URL = process.env.GITHUB_SERVER_URL || 'https://github.com';
const GITHUB_HEAD_REF = process.env.GITHUB_HEAD_REF;

// Action inputs (GitHub Actions exposes each `inputs:` entry from action.yml
// as an INPUT_<NAME> environment variable when running via 'using: node24')
const SONAR_HOST_URL = process.env.INPUT_SONAR_HOST_URL;
const SONAR_PUBLIC_HOST_URL = process.env.INPUT_SONAR_PUBLIC_HOST_URL;
const SONAR_TOKEN = process.env.INPUT_SONAR_TOKEN;
const GITHUB_TOKEN = process.env.INPUT_GITHUB_TOKEN;
const REPO_NAME = process.env.INPUT_REPO_NAME;
const PR_NUMBER = process.env.INPUT_PR_NUMBER;

let sonarProperties;

function loadSonarProperties(propertiesPath) {
    const contents = fs.readFileSync(propertiesPath, 'utf8');
    const properties = {};

    for (const line of contents.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
            continue;
        }

        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) {
            continue;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        const value = trimmed.slice(separatorIndex + 1).trim();
        properties[key] = value;
    }

    return properties;
}

async function getRawQualityGateStatus() {
    const qualityGateUrl = `${SONAR_HOST_URL}/api/qualitygates/project_status?projectKey=${sonarProperties['sonar.projectKey']}`;
    // Make the request to the SonarQube API
    const auth = Buffer.from(`${SONAR_TOKEN}:`).toString('base64');
    const response = await fetch(qualityGateUrl, {
        headers: { Authorization: `Basic ${auth}` },
    });

    if (!response.ok) {
        throw new Error(`SonarQube request failed: ${response.status} ${response.statusText}`);
    }

    const projectStatus = await response.json();
    const qualityGateStatus = projectStatus.projectStatus.status;

    console.log(`Quality gate status retrieved: ${qualityGateStatus}`);
    return { qualityGateStatus, projectStatus };
}

// Collects every item of a paged SonarQube search endpoint, e.g. api/issues/search -> "issues".
async function sonarSearchAll(apiPath, listKey, params) {
    const auth = Buffer.from(`${SONAR_TOKEN}:`).toString('base64');
    const items = [];

    for (let page = 1; ; page += 1) {
        const query = new URLSearchParams({ ...params, p: String(page), ps: '500' });
        const response = await fetch(`${SONAR_HOST_URL}/${apiPath}?${query}`, {
            headers: { Authorization: `Basic ${auth}` },
        });

        if (!response.ok) {
            const errorText = (await response.text()).slice(0, 300);
            throw new Error(`SonarQube request failed: ${apiPath} ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        const batch = data[listKey] || [];
        items.push(...batch);

        const total = data.paging ? data.paging.total : items.length;
        if (batch.length === 0 || items.length >= total) {
            return items;
        }
    }
}

function severityRank(severity) {
    const index = SEVERITY_ORDER.indexOf(severity);
    return index === -1 ? SEVERITY_ORDER.length : index;
}

function severityOf(issue) {
    const severities = (issue.impacts || []).map((impact) => impact.severity);
    severities.sort((a, b) => severityRank(a) - severityRank(b));
    return severities[0] || '?';
}

// "my_project:src/app/run.py" -> "src/app/run.py"
function filePathOf(finding) {
    const prefix = `${sonarProperties['sonar.projectKey']}:`;
    const component = finding.component || '';
    return component.startsWith(prefix) ? component.slice(prefix.length) : component;
}

async function getBlockingIssues() {
    const projectKey = sonarProperties['sonar.projectKey'];
    const base = { components: projectKey, resolved: 'false' };
    const [severe, vulnerabilities] = await Promise.all([
        sonarSearchAll('api/issues/search', 'issues', { ...base, impactSeverities: 'BLOCKER,HIGH' }),
        sonarSearchAll('api/issues/search', 'issues', { ...base, types: 'VULNERABILITY' }),
    ]);

    // A High vulnerability comes back from both queries; keep it once.
    const byKey = new Map();
    for (const issue of [...severe, ...vulnerabilities]) {
        byKey.set(issue.key, issue);
    }

    return [...byKey.values()].map((issue) => ({
        kind: issue.type === 'VULNERABILITY' ? 'Vulnerability' : 'Issue',
        severity: severityOf(issue),
        message: issue.message || '',
        path: filePathOf(issue),
        line: issue.line,
        sonarLink: `${SONAR_PUBLIC_HOST_URL}/project/issues?id=${projectKey}&open=${issue.key}`,
    }));
}

function extractCodeDetails(projectStatus) {
    const conditions = projectStatus.projectStatus.conditions || [];
    if (conditions.length === 0) {
        return '_The quality gate has no conditions._';
    }

    const results = { OK: '✅ OK', ERROR: '❌ FAIL' };
    const lines = ['| Condition | Result | Fails when | Actual |', '|---|---|---|---|'];
    for (const condition of conditions) {
        const result = results[condition.status] || `➖ ${condition.status}`;
        const comparator = COMPARATORS[condition.comparator] || condition.comparator || '';
        lines.push(
            `| \`${condition.metricKey}\` | ${result} | ${comparator} ${condition.errorThreshold ?? ''}`
            + ` | ${condition.actualValue ?? '-'} |`,
        );
    }

    return lines.join('\n');
}

async function getQualityGateStatus() {
    const [{ qualityGateStatus, projectStatus }, issues] = await Promise.all([
        getRawQualityGateStatus(),
        getBlockingIssues(),
    ]);
    const projectKey = sonarProperties['sonar.projectKey'];

    const headlines = { OK: '✅ PASSED', ERROR: '❌ FAILED' };
    const headline = headlines[qualityGateStatus] || `⚠️ ${qualityGateStatus}`;
    let result = `${COMMENT_MARKER}\n## SonarQube quality gate: ${headline}\n\n${extractCodeDetails(projectStatus)}\n`;

    const links = `\n[details - new code](${SONAR_PUBLIC_HOST_URL}/dashboard?id=${projectKey}&codeScope=new)`
        + `\n[details - overall](${SONAR_PUBLIC_HOST_URL}/dashboard?id=${projectKey}&codeScope=overall)`;

    // Vulnerabilities first, whatever their severity; then the most severe issues.
    const kindRank = (finding) => (finding.kind === 'Vulnerability' ? 0 : 1);
    const findings = issues.sort(
        (a, b) => kindRank(a) - kindRank(b)
            || severityRank(a.severity) - severityRank(b.severity)
            || a.path.localeCompare(b.path)
            || (a.line || 0) - (b.line || 0),
    );

    if (findings.length === 0) {
        result += '\nNo open Blocker/High issues or vulnerabilities.\n';
    } else {
        result += `\n### Open findings (${findings.length})\n\n`
            + '| Kind | Severity | Message | Path | Links |\n|---|---|---|---|---|\n';

        // Leave room for the links and the "... and N more" line.
        const budget = COMMENT_LENGTH_BUDGET - links.length - 40;
        let shown = 0;
        for (const finding of findings) {
            const message = finding.message.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
            const where = finding.line ? `${finding.path}:${finding.line}` : finding.path;
            const encodedPath = finding.path.split('/').map(encodeURIComponent).join('/');
            const githubLink = finding.path
                ? `[GitHub](${GITHUB_SERVER_URL}/${REPO_NAME}/blob/${GITHUB_HEAD_REF}/${encodedPath}`
                    + `${finding.line ? `#L${finding.line}` : ''}) `
                : '';
            const row = `| ${finding.kind} | ${finding.severity} | ${message} | \`${where}\``
                + ` | ${githubLink}[SonarQube](${finding.sonarLink}) |\n`;
            if (result.length + row.length > budget) {
                break;
            }
            result += row;
            shown += 1;
        }
        if (shown < findings.length) {
            result += `\n… and ${findings.length - shown} more.\n`;
        }
    }

    return result + links;
}

// The comment left by a previous run of this action on the same pull request, if any.
async function findExistingComment(commentsUrl, headers) {
    for (let page = 1; ; page += 1) {
        const response = await fetch(`${commentsUrl}?per_page=100&page=${page}`, { headers });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`GitHub request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const comments = await response.json();
        const existing = comments.find((comment) => comment.body && comment.body.includes(COMMENT_MARKER));
        if (existing || comments.length < 100) {
            return existing;
        }
    }
}

async function commentOnPullRequest(body) {
    const commentsUrl = `${GITHUB_API_BASE_URL}/repos/${REPO_NAME}/issues/${PR_NUMBER}/comments`;
    const headers = {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
    };

    const existing = await findExistingComment(commentsUrl, headers);
    const url = existing ? `${GITHUB_API_BASE_URL}/repos/${REPO_NAME}/issues/comments/${existing.id}` : commentsUrl;

    const response = await fetch(url, {
        method: existing ? 'PATCH' : 'POST',
        headers,
        body: JSON.stringify({ body }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    console.log(`${existing ? 'Updated' : 'Added'} comment on Pull Request #${PR_NUMBER}.`);
}

async function main() {
    // sanity checks
    if (process.env.NODE_USE_ENV_PROXY === '1') {
        const majorVersion = Number(process.versions.node.split('.')[0]);
        if (majorVersion < 22) {
            console.error(`NODE_USE_ENV_PROXY requires Node.js v22 or newer, but running on Node.js v${process.versions.node}.`);
            process.exit(1);
        }
    }

    // Read once at startup and expose the properties we need as constants.
    sonarProperties = loadSonarProperties(SONAR_PROPERTIES_PATH);

    if (!GITHUB_TOKEN || !REPO_NAME || !PR_NUMBER) {
        console.log('Error: GitHub token, repository, or PR number not configured.');
        process.exit(2);
    }

    if (!sonarProperties['sonar.projectKey']) {
        console.log(`Error: sonar.projectKey not found in ${SONAR_PROPERTIES_PATH}`);
        process.exit(3);
    }

    await commentOnPullRequest(await getQualityGateStatus());

}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
