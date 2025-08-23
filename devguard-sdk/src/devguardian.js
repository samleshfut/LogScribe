const axios = require('axios');
const os = require('os');
const { promises: fs } = require('fs');

const DEFAULT_MAIN_AI_URL = 'http://localhost:4000/analyze-bug';
let isInitialized = false;

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
        await axios.post(DEFAULT_MAIN_AI_URL, bundle);
        console.log('[DevGuardian] Report successfully sent to Main AI for analysis.');
    } catch (err) {
        console.error('[DevGuardian] CRITICAL: Failed to send report to Main AI server.');
    }
}

async function captureException(error, customContext = {}) {
    console.log('[DevGuardian] Manually capturing handled exception...');
    const bundle = await createBugReportBundle(error);
    bundle.customContext = customContext;
    bundle.isHandled = true;
    await sendReportToMainAI(bundle);
}

function init() {
    if (isInitialized) {
        console.warn('[DevGuardian] Warning: init() called multiple times. Ignoring.');
        return;
    }

    console.log('[DevGuardian] SDK Initialized. Monitoring application runtime.');
    
    process.on('uncaughtException', async (error) => {
        console.error('[DevGuardian] Uncaught Exception Detected!');
        const bundle = await createBugReportBundle(error);
        bundle.isHandled = false;
        bundle.errorType = 'UncaughtException';
        await sendReportToMainAI(bundle);
        
        console.error('[DevGuardian] Application is in an unstable state. Exiting now.');
        process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
        console.error('[DevGuardian] Unhandled Promise Rejection Detected!');
        const error = reason instanceof Error ? reason : new Error(`Unhandled Rejection: ${JSON.stringify(reason)}`);
        
        const bundle = await createBugReportBundle(error);
        bundle.isHandled = false;
        bundle.errorType = 'UnhandledRejection';
        await sendReportToMainAI(bundle);
    });

    isInitialized = true;
}

module.exports = {
    init,
    captureException
};