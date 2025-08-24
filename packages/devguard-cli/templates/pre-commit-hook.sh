#!/bin/sh
# templates/pre-commit-hook.sh

DEVGUARDIAN_LINT_URL=$(git config --get devguardian.lintUrl)

if [ -z "$DEVGUARDIAN_LINT_URL" ]; then
  echo "❌ [DevGuardian] Error: Linter URL is not configured."
  echo "   Please run 'devguardian init' or set it manually with:"
  echo "   git config devguardian.lintUrl https://your-api-url.com/dev/lint-code"
  exit 1
fi

echo "🤖 [DevGuardian Lint] Analyzing staged files..."
STAGED_FILES=$(git diff --cached --name-only --filter=ACM | grep -E '\.(js|ts|jsx|tsx)$')
if [ -z "$STAGED_FILES" ]; then
  echo "No relevant files to analyze. Proceeding with commit."
  exit 0
fi
has_errors=0
for FILE in $STAGED_FILES; do
  echo "  -> Analyzing $FILE..."
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST --data-binary "@$FILE" "$DEVGUARDIAN_LINT_URL")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  CONTENT=$(echo "$RESPONSE" | sed '$d')
  if [ "$HTTP_CODE" -eq 200 ]; then
    echo "  ✅ OK"
  else
    echo "  🔥 [DevGuardian] Found a critical issue in $FILE:"
    echo "     ------------------------------------------------"
    echo "     AI Analysis: $CONTENT"
    echo "     ------------------------------------------------"
    has_errors=1
  fi
done
if [ "$has_errors" -ne 0 ]; then
  echo "\n❌ Commit aborted by DevGuardian. Please fix the issues above and try again."
  exit 1
else
  echo "\n✅ DevGuardian analysis passed. Proceeding with commit."
  exit 0
fi