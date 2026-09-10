'use strict';

const fs = require('fs');
const path = require('path');

const GITHUB_API_BASE_URL = 'https://api.github.com';
const SONAR_PROPERTIES_PATH = path.join(process.env.GITHUB_WORKSPACE || process.cwd(), 'sonar-project.properties');

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

function extractCodeDetails(projectStatus, statusFilter) {
    const conditions = projectStatus.projectStatus.conditions;
    const filteredConditions = conditions.filter((condition) => condition.status === statusFilter);

    const details = filteredConditions.map((condition) => (
        `\nStatus: ${condition.status}, \n`
        + `MetricKey: ${condition.metricKey}\n`
        + `Comparator: ${condition.comparator}\n`
        + `ErrorThreshold: ${condition.errorThreshold}\n`
        + `ActualValue: ${condition.actualValue}\n`
    ));

    return details.join('');
}

async function getQualityGateStatus() {
    const { qualityGateStatus, projectStatus } = await getRawQualityGateStatus();

    let result;
    if (qualityGateStatus === 'OK') {
        const codeOk = extractCodeDetails(projectStatus, 'OK');
        result = `Quality Gate has PASSED.${codeOk}`;
    } else if (qualityGateStatus === 'ERROR') {
        const codeFail = extractCodeDetails(projectStatus, 'ERROR');
        result = `Quality Gate has FAILED.${codeFail}`;
    } else {
        result = 'quality_check=ERROR CONFIGURATION';
    }

    result = `${result}\n[details - new code](${SONAR_PUBLIC_HOST_URL}/dashboard?id=${sonarProperties['sonar.projectKey']}&codeScope=new)`;
    result = `${result}\n[details - overall](${SONAR_PUBLIC_HOST_URL}/dashboard?id=${sonarProperties['sonar.projectKey']}&codeScope=overall)`;

    return result;
}

async function commentOnPullRequest(body) {
    const url = `${GITHUB_API_BASE_URL}/repos/${REPO_NAME}/issues/${PR_NUMBER}/comments`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    console.log(`Commenting on Pull Request #${PR_NUMBER}.`);
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
