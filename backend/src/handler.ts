// src/handler.ts

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { BugReportBundle } from './shared-types-and-objects/types';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import axios from 'axios';


const s3Client = new S3Client({ region: process.env.AWS_REGION });
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const bedrockModelId = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-haiku-20240307-v1:0";
const secretsManagerClient = new SecretsManagerClient({ region: process.env.AWS_REGION });



async function getBedrockAnalysis(prompt: string): Promise<string> {
    const command = new InvokeModelCommand({
        modelId: bedrockModelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 4096, // Increased token limit for reviews
            messages: [{ role: "user", content: prompt }]
        })
    });

    const bedrockResponse = await bedrockClient.send(command);
    const decodedBody = new TextDecoder().decode(bedrockResponse.body);
    const responseBody = JSON.parse(decodedBody);
    return responseBody.content[0].text;
}

let cachedGeminiApiKey: string | null = null;
async function getGeminiApiKey(): Promise<string> {
    if (cachedGeminiApiKey) return cachedGeminiApiKey;
    const secretArn = process.env.GEMINI_API_KEY_SECRET_ARN!;
    const command = new GetSecretValueCommand({ SecretId: secretArn });
    const secretValue = await secretsManagerClient.send(command);
    const secretJson = JSON.parse(secretValue.SecretString!);
    cachedGeminiApiKey = secretJson.GEMINI_API_KEY;
    if (!cachedGeminiApiKey) throw new Error("GEMINI_API_KEY not found in secret.");
    return cachedGeminiApiKey;
}

export const analyzeBug = async (event: any) => {
    try {
        const bugReportBundle: BugReportBundle = JSON.parse(event.body);

        const bucketName = process.env.S3_BUCKET_NAME!;
        const objectKey = `bugs/bug-${Date.now()}.json`;
        const putCommand = new PutObjectCommand({
            Bucket: bucketName, Key: objectKey, Body: JSON.stringify(bugReportBundle), ContentType: 'application/json'
        });
        await s3Client.send(putCommand);
        
        const prompt = `
            You are a world-class Senior Software Engineer acting as an automated debugging partner. Analyze the following bug report. Provide a response ONLY in a valid JSON format with three keys: "rootCause", "suggestedFix", and "impactAnalysis".

            BUG CONTEXT: ${JSON.stringify(bugReportBundle, null, 2)}
        `;
        
        const analysisText = await getBedrockAnalysis(prompt);
        const analysisJson = JSON.parse(analysisText);

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(analysisJson)
        };
    } catch (error) {
        console.error('Error in analyzeBug handler:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Internal Server Error' }) };
    }
};


export const lintCode = async (event: any) => {
    try {
        const code = event.body;
        if (!code) return { statusCode: 400, body: "No code provided." };

        const prompt = `
            You are a senior engineer acting as an automated linter. Analyze the following code file.
            If you find a potential critical bug, security vulnerability, or serious anti-pattern,
            describe the single most critical issue in one concise sentence.
            If the code is clean, you MUST respond with ONLY the word "OK".

            CODE:
            ---
            ${code}
        `;

        const aiResponse = await getBedrockAnalysis(prompt);

        if (aiResponse.trim().toUpperCase() === "OK") {
            return { statusCode: 200, body: "OK" };
        } else {
            return {
                statusCode: 400, 
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: aiResponse
            };
        }
    } catch (error) {
        console.error('Error in lintCode handler:', error);
        return { statusCode: 500, body: "Error during analysis." };
    }
};


export const reviewPR = async (event: any) => {
    try {
        const diff = event.body;
        if (!diff) return { statusCode: 400, body: "No diff provided." };

       const prompt = `
            You are an expert AI code reviewer. Analyze the following 'git diff'. Your task is to act like a real reviewer on GitHub.
            Provide your response ONLY in a valid JSON format with two keys: "decision" and "comments".

            - "decision": A single string, either "REQUEST_CHANGES" or "COMMENT".
              - Choose "REQUEST_CHANGES" if you find any specific, actionable issues in the code.
              - Choose "COMMENT" if the code is good and has no issues.
            - "comments": An array of objects. Each object represents a specific comment on a line of code and must have three keys:
              - "path": The full file path of the file being commented on (e.g., "src/index.js").
              - "line": The line number in the file where the change is.
              - "body": Your comment for that specific line, written in concise GitHub Markdown.

            Analyze the diff line by line. For each file, identify the line number of any potential bugs, security issues, or bad practices.

            Example of a valid response:
            {
              "decision": "REQUEST_CHANGES",
              "comments": [
                {
                  "path": "src/api/user.js",
                  "line": 42,
                  "body": "This API key is hardcoded. It should be loaded from an environment variable for security."
                },
                {
                  "path": "src/utils/helpers.js",
                  "line": 15,
                  "body": "This function could be simplified by using the Array.prototype.map() method."
                }
              ]
            }

            If the code is perfect, return an empty "comments" array and a "decision" of "COMMENT".

            GIT DIFF:
            ---
            ${diff}
        `;

        const apiKey = await getGeminiApiKey();
        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

        const requestBody = {
            contents: [{ parts: [{ "text": prompt }] }],
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            ],
            generationConfig: {
                responseMimeType: "application/json",
            },
        };
        
         console.log('Sending request to Gemini API...');
        const response = await axios.post(geminiApiUrl, requestBody, { headers: { 'Content-Type': 'application/json' } });
        
        // 4. The response body itself should now be the JSON string we asked for
        const aiReviewJson = response.data.candidates[0].content.parts[0].text;
        
        console.log("--- Gemini Review Generated ---");
        console.log(aiReviewJson);
        
        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: aiReviewJson
        };
    } catch (error) {
        console.error('Error in reviewPR handler:', error);
        return { statusCode: 500, body: "Sorry, I was unable to complete the review due to an internal error." };
    }
};