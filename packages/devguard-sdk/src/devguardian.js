const axios = require('axios');
const os = require('os');
const { promises: fs } = require('fs');
const FormData = require('form-data');

const path = require('path');

let isInitialized = false;

let config = {
    uploadUrl: 'https://c53puq7hy7.execute-api.af-south-1.amazonaws.com/prod/uploadLogs',
    apiKey: "something",
};

function loadJiraConfig() {
    try {
        const configPath = path.join(os.homedir(), '.devguardian', 'config.json');
        const configData = require('fs').readFileSync(configPath, 'utf8');
        const config = JSON.parse(configData);
        return config.jira || null;
    } catch (err) {
        console.warn('[DevGuardian] Could not load Jira configuration:', err.message);
        return null;
    }
}

function getJiraConfig() {
    return loadJiraConfig();
}

async function testJiraConnection() {
    const jiraConfig = loadJiraConfig();
    if (!jiraConfig || !jiraConfig.apiKey) {
        throw new Error('Jira configuration not found. Please run "devguardian config jira" first.');
    }

    try {
        const response = await axios.get(`${jiraConfig.baseUrl}/rest/api/3/myself`, {
            auth: {
                username: jiraConfig.email,
                password: jiraConfig.apiKey
            }
        });
        return {
            success: true,
            user: response.data.displayName,
            email: response.data.emailAddress
        };
    } catch (err) {
        throw new Error(`Jira connection failed: ${err.message}`);
    }
}

function parseStackTraceForFiles(stack) {
    if (!stack) return new Set();
    
    const fileRegex = /\((?:file:\/\/\/)?(.+?):\d+:\d+\)/g;
    const matches = stack.matchAll(fileRegex);
    const filePaths = new Set();

    for (const match of matches) {
        const fullPath = match[1]

        console.log(fullPath);
        
        if (!fullPath.includes('node:internal') && !fullPath.includes('node_modules')) {
            filePaths.add(path.resolve(fullPath));
        }
    }

    console.log(filePaths);
    return filePaths;
}

async function uploadBugReport(error, isHandled, errorType, customContext = {}) {
    if (!isInitialized) return console.error('[DevGuardian] Error: Attempted to report an error before init().');
    console.log(`[DevGuardian] ${errorType} Detected! Capturing full context...`);

    console.log(error);
    console.log(error.stack);

    const stackTrace = error.stack;
    const bugReportJson = {
        apiKey: config.apiKey,
        errorMessage: error.message,
        errorName: error.name,
        stackTrace,
        isHandled,
        errorType,
        customContext,
        environment: {
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version,
            cwd: process.cwd(),
            user: os.userInfo().username,
        }
    };
    
    const filesToUpload = parseStackTraceForFiles(stackTrace);
    console.log(`[DevGuardian] Found ${filesToUpload.size} relevant source file(s) in stack trace.`);

    const form = new FormData();

     form.append('files', JSON.stringify(bugReportJson, null, 2), { 
        filename: 'error.json', 
        contentType: 'application/json' 
    });

    const fileReadPromises = Array.from(filesToUpload).map(async (filePath) => {
        try {
            const content = await fs.readFile(filePath);
            const fileName = path.basename(filePath);
            form.append("files", content, { filename: fileName });
            return { file: fileName, status: 'read_success' };
        } catch (err) {
            console.warn(`[DevGuardian] Warning: Could not read file from stack trace: ${filePath}`);
            return { file: path.basename(filePath), status: 'read_failed' };
        }
    });

    await Promise.all(fileReadPromises);

    try {
        console.log('[DevGuardian] Uploading bug report and source files to Main AI...');
        const response = await axios.post(config.uploadUrl, form, {
            headers: form.getHeaders(),
        });

        console.log('[DevGuardian] Upload successful! Response from server:');
        console.log(JSON.stringify(response.data, null, 2));

    } catch (err) {
        const errorMessage = err.response ? JSON.stringify(err.response.data) : err.message;
        console.error(`[DevGuardian] CRITICAL: Failed to upload report to Main AI server. Error: ${errorMessage}`);
    }
}

function parseStackTop(stack) {
    if (!stack) return { filePath: null, lineNumber: null };
    const lines = stack.split('\n');
    if (lines.length < 2) return { filePath: null, lineNumber: null };
    
    const stackLineRegex = /\(([^)]+):(\d+):(\d+)\)/;
    const match = lines[1].match(stackLineRegex);
    
    if (match && match[1]) {
        return {
            filePath: match[1],
            lineNumber: parseInt(match[2], 10)
        };
    }
    return { filePath: null, lineNumber: null };
}

async function getCodeSnippet(filePath, lineNumber, contextLines = 3) {
    if (!filePath || !lineNumber) return null;
    try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const lines = fileContent.split('\n');
        
        const start = Math.max(0, lineNumber - 1 - contextLines);
        const end = Math.min(lines.length, lineNumber + contextLines);

        let snippet = '';
        for (let i = start; i < end; i++) {
            const prefix = (i === lineNumber - 1) ? '-> ' : '   ';
            snippet += `${String(i + 1).padStart(4, ' ')} | ${prefix}${lines[i]}\n`;
        }
        return snippet;
    } catch (err) {
        return null;
    }
}

async function createBugReportBundle(error) {
    const stackTrace = error.stack;
    const { filePath, lineNumber } = parseStackTop(stackTrace);
    const codeSnippet = await getCodeSnippet(filePath, lineNumber);

    return {
        apiKey: config.apiKey, 
        errorMessage: error.message,
        errorName: error.name,
        stackTrace,
        codeSnippet,
        filePath,
        lineNumber,
        environment: {
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version,
            cwd: process.cwd(),
            user: os.userInfo().username,
        }
    };
}

async function sendReportToMainAI(bundle) {
    try {
        await axios.post(config.mainAiUrl, bundle);
        console.log('[DevGuardian] Report successfully sent to Main AI for analysis.');
    } catch (err) {
        console.error('[DevGuardian] CRITICAL: Failed to send report to Main AI server.');
    }
}

function init(options) {
    if (isInitialized) {
        console.warn('[DevGuardian] Warning: init() called multiple times. Ignoring.');
        return;
    }

    // if (!options) {
    //     console.error('[DevGuardian] FATAL: API Key is missing. Please provide an apiKey in the init() options.');
    //     return; 
    // }
    config = { ...config, ...options };

    console.log('[DevGuardian] SDK Initialized. Monitoring application runtime.');

    
    process.on('uncaughtException', async (error) => {
        console.error('[DevGuardian] Uncaught Exception Detected!');
        uploadBugReport(error, false, 'UncaughtException');

        console.error('[DevGuardian] Application is in an unstable state. Exiting now.');
        process.exit(1);
        
        setTimeout(() => {
            console.error('[DevGuardian] Application is in an unstable state. Exiting now.');
            process.exit(1);
        }, 3000);
    });

    process.on('unhandledRejection', (reason) => {
        const error = reason instanceof Error ? reason : new Error(`Unhandled Rejection: ${JSON.stringify(reason)}`);
        uploadBugReport(error, false, 'UnhandledRejection');
    });

    isInitialized = true;
}

function captureException(error, customContext = {}) {
    uploadBugReport(error, true, 'HandledException', customContext);
}

module.exports = {
    init,
    captureException,
    getJiraConfig,
    testJiraConnection
};