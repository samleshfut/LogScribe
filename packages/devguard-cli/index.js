#!/usr/bin/env node

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const fse = require('fs-extra');
const path = require('path');

const { execSync } = require('child_process');


async function installLinter(answers) {
    const { default: chalk } = await import('chalk');

    console.log(chalk.blue('Setting up Pre-Commit Linter...'));
    const hookTemplatePath = path.join(__dirname, 'templates', 'pre-commit-hook.sh');
    const projectHookPath = path.resolve(process.cwd(), '.git', 'hooks', 'pre-commit');

    try {
        if (!fse.existsSync(path.dirname(projectHookPath))) {
            console.error(chalk.red('Error: This does not appear to be a git repository. The ".git" directory was not found.'));
            return false;
        }

        execSync(`git config devguardian.lintUrl "${answers.lintUrl}"`);
        console.log(chalk.gray('  -> Saved Linter URL to git config.'));

        fse.copySync(hookTemplatePath, projectHookPath);
        fse.chmodSync(projectHookPath, '755'); // Make it executable
        console.log(chalk.green('✅ Pre-Commit Linter installed successfully!'));
        return true;
    } catch (err) {
        console.error(chalk.red('Failed to install pre-commit hook:'), err);
        return false;
    }
}

async function installReviewer() {
    const { default: chalk } = await import('chalk');

    console.log(chalk.blue('Setting up PR Reviewer...'));
    const reviewerTemplatePath = path.join(__dirname, 'templates', 'devguardian-review.yml');
    const projectWorkflowDir = path.resolve(process.cwd(), '.github', 'workflows');
    const projectWorkflowPath = path.join(projectWorkflowDir, 'devguardian-review.yml');

    try {
        fse.ensureDirSync(projectWorkflowDir);
        fse.copySync(reviewerTemplatePath, projectWorkflowPath);
        console.log(chalk.green('✅ PR Reviewer workflow file created successfully!'));
        console.log(chalk.yellow('\nAction Required: To complete setup, please go to your GitHub repository settings'));
        console.log(chalk.yellow('and add a new repository secret named "DEVGUARDIAN_REVIEW_URL" with the URL to your analysis endpoint.'));
        return true;
    } catch (err) {
        console.error(chalk.red('Failed to create PR Reviewer workflow file:'), err);
        return false;
    }
}


async function main() {
    const { default: chalk } = await import('chalk');
    const { default: inquirer } = await import('inquirer');

    yargs(hideBin(process.argv))
        .command('init', 'Initialize DevGuardian agents in the current project', {}, async (argv) => {
            console.log(chalk.bold.cyan('Welcome to DevGuardian Setup!'));
            console.log('This will guide you through setting up the AI-powered agents.\n');

            const answers = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'enableLinter',
                    message: 'Enable the Pre-Commit Linter? (Catches bugs before you commit)',
                    default: true,
                },
                {
                    type: 'confirm',
                    name: 'enableReviewer',
                    message: 'Enable the Pull Request Reviewer? (AI code reviews on GitHub)',
                    default: true,
                },
                {
                    type: 'input',
                    name: 'lintUrl',
                    message: 'Enter the URL for your DevGuardian Linter endpoint:',
                    when: (answers) => answers.enableLinter,
                    validate: (input) => input.startsWith('http') || 'Please enter a valid URL.'
                },
            ]);

            console.log('');

            if (answers.enableLinter) {
                await installLinter(answers);
            }

            console.log('');

            if (answers.enableReviewer) {
                await installReviewer();
            }

            console.log(chalk.bold.green('\nDevGuardian setup complete! Commit the new files to your repository.'));
        })
        .demandCommand(1, 'Please specify a command. Try "init".')
        .help()
        .argv;
}


main().catch(err => {
    console.error('An unexpected error occurred:', err);
    process.exit(1);
});