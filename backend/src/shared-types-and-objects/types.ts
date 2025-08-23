export interface BugReportBundle {
  errorMessage: string;
  errorName: string;
  stackTrace: string;
  codeSnippet: string | null;
  filePath: string | null;
  lineNumber: number | null;
  environment: {
    platform: string;
    arch: string;
    nodeVersion: string;
    cwd: string;
    user: string;
  };
  isHandled: boolean;
  errorType: 'UncaughtException' | 'UnhandledRejection';
  customContext?: any;
}