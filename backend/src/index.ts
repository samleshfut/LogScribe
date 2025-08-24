import express from "express";
import { appConfig } from "./configs/app-config";

import { Express, Request, Response, NextFunction } from 'express';
import { BugReportBundle } from "./shared-types-and-objects/types";


const app = express();
app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`[${new Date().toISOString()}] Received ${req.method} request for ${req.url}`);
    next();
});

app.post('/analyze-bug', (req: Request, res: Response) => {
    
    const bugReportBundle: BugReportBundle = req.body;

    console.log('\n--- ✅ Bug Report Received ---');
    console.log(JSON.stringify(bugReportBundle, null, 2));
    console.log('--- End of Report ---\n');

    res.status(200).json({
        status: 'success',
        message: 'Bug report received and logged.'
    });
});

app.listen(appConfig.port, () => {
  console.log(`🚀 Backend running in ${appConfig.env} mode on http://localhost:${appConfig.port}`);
});
