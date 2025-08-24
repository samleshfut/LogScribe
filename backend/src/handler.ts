// src/handler.ts

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { BugReportBundle } from './shared-types-and-objects/types';


const s3Client = new S3Client({ region: process.env.AWS_REGION });
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const bedrockModelId = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-haiku-20240307-v1:0";


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
                statusCode: 400, // Bad Request is a good signal for a linting error.
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
            You are a helpful and constructive AI code reviewer. Analyze the following 'git diff' from a pull request.
            Provide a brief, high-level summary of the changes. Then, if you spot any potential bugs, logical errors,
            or areas for improvement, list them as bullet points using Markdown. If the changes look good, say so.
            Keep your response concise and professional.

            GIT DIFF:
            ---
            ${diff}
        `;
        
        const aiReview = await getBedrockAnalysis(prompt);

        return {
            statusCode: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: aiReview
        };
    } catch (error) {
        console.error('Error in reviewPR handler:', error);
        return { statusCode: 500, body: "Sorry, I was unable to complete the review due to an internal error." };
    }
};