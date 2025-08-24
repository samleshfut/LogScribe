#!/usr/bin/env node

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const fse = require('fs-extra');
const path = require('path');
const os = require('os');

const { execSync } = require('child_process');

const CONFIG_DIR = path.join(os.homedir(), '.devguardian');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG = {
    jira: {
        apiKey: '',
        baseUrl: '',
        email: '',
        projectKey: ''
    },
    lintUrl: '',
    reviewUrl: '',
    project_id: ''
};

function loadConfig() {
    try {
        if (fse.existsSync(CONFIG_FILE)) {
            return fse.readJsonSync(CONFIG_FILE);
        }
    } catch (err) {
        console.warn('Warning: Could not load existing config file, using defaults.');
    }
    return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
    try {
        fse.ensureDirSync(CONFIG_DIR);
        fse.writeJsonSync(CONFIG_FILE, config, { spaces: 2 });
        return true;
    } catch (err) {
        console.error('Failed to save configuration:', err);
        return false;
    }
}

function displayConfig(config) {
    const { default: chalk } = require('chalk');
    
    console.log(chalk.bold.cyan('\nCurrent DevGuardian Configuration:'));
    console.log(chalk.gray('─'.repeat(50)));
    
    if (config.jira.apiKey) {
        console.log(chalk.green('✓ Jira API Key:'), chalk.gray('Configured'));
        console.log(chalk.green('✓ Jira Base URL:'), config.jira.baseUrl || chalk.yellow('Not set'));
        console.log(chalk.green('✓ Jira Email:'), config.jira.email || chalk.yellow('Not set'));
        console.log(chalk.green('✓ Jira Project Key:'), config.jira.projectKey || chalk.yellow('Not set'));
    } else {
        console.log(chalk.red('✗ Jira:'), chalk.yellow('Not configured'));
    }
    
    if (config.lintUrl) {
        console.log(chalk.green('✓ Linter URL:'), config.lintUrl);
    } else {
        console.log(chalk.red('✗ Linter URL:'), chalk.yellow('Not configured'));
    }
    
    if (config.reviewUrl) {
        console.log(chalk.green('✓ Review URL:'), config.reviewUrl);
    } else {
        console.log(chalk.red('✗ Review URL:'), chalk.yellow('Not configured'));
    }
    
    if (config.project_id) {
        console.log(chalk.green('✓ Project ID:'), config.project_id);
    } else {
        console.log(chalk.red('✗ Project ID:'), chalk.yellow('Not configured'));
    }
    
    console.log(chalk.gray('─'.repeat(50)));
}

// Configure Jira settings
async function configureJira() {
    const { default: chalk } = await import('chalk');
    const { default: inquirer } = await import('inquirer');
    
    console.log(chalk.blue('Configuring Jira Integration...'));
    
    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'baseUrl',
            message: 'Enter your Jira base URL (e.g., https://yourcompany.atlassian.net):',
            validate: (input) => {
                if (!input) return 'Base URL is required';
                if (!input.startsWith('http')) return 'Please enter a valid URL starting with http:// or https://';
                return true;
            }
        },
        {
            type: 'input',
            name: 'email',
            message: 'Enter your Jira email address:',
            validate: (input) => {
                if (!input) return 'Email is required';
                if (!input.includes('@')) return 'Please enter a valid email address';
                return true;
            }
        },
        {
            type: 'password',
            name: 'apiKey',
            message: 'Enter your Jira API key (Personal Access Token):',
            validate: (input) => {
                if (!input) return 'API key is required';
                if (input.length < 10) return 'API key seems too short';
                return true;
            }
        },
        {
            type: 'input',
            name: 'projectKey',
            message: 'Enter your Jira project key (e.g., PROJ):',
            validate: (input) => {
                if (!input) return 'Project key is required';
                if (input.length < 2) return 'Project key seems too short';
                return true;
            }
        }
    ]);
    
    const config = loadConfig();
    config.jira = {
        baseUrl: answers.baseUrl,
        email: answers.email,
        apiKey: answers.apiKey,
        projectKey: answers.projectKey
    };
    
    if (saveConfig(config)) {
        console.log(chalk.green('✅ Jira configuration saved successfully!'));
        console.log(chalk.gray('Configuration saved to:'), CONFIG_FILE);
        
        // Test the configuration
        console.log(chalk.blue('\nTesting Jira connection...'));
        try {
            const axios = require('axios');
            const response = await axios.get(`${answers.baseUrl}/rest/api/3/myself`, {
                auth: {
                    username: answers.email,
                    password: answers.apiKey
                }
            });
            console.log(chalk.green('✅ Jira connection successful!'));
            console.log(chalk.gray('Connected as:'), response.data.displayName);
            
            // Store configuration in AWS Secrets Manager
            console.log(chalk.blue('\nStoring configuration in AWS Secrets Manager...'));
            try {
                const awsResponse = await axios.post('https://6zgllvkz94.execute-api.af-south-1.amazonaws.com/dev/registerProject', {
                    baseUrl: answers.baseUrl,
                    email: answers.email,
                    apiKey: answers.apiKey,
                    projectKey: answers.projectKey
                });
                
                if (awsResponse.data && awsResponse.data.project_id) {
                    // Save the project_id to local config
                    config.project_id = awsResponse.data.project_id;
                    saveConfig(config);
                    
                    console.log(chalk.green('✅ Configuration stored in AWS Secrets Manager successfully!'));
                    console.log(chalk.green('✅ Project ID:'), awsResponse.data.project_id);
                    
                    // Display the UUID returned from the endpoint
                    if (awsResponse.data.uuid) {
                        console.log(chalk.blue('\n📋 Organization UUID returned:'), awsResponse.data.uuid);
                        console.log(chalk.yellow('💡 Add this to your environment variables:'));
                        console.log(chalk.gray('   export DEVGUARDIAN_UUID="' + awsResponse.data.uuid + '"'));
                        console.log(chalk.gray('   # Or add to your .bashrc/.zshrc file'));
                    }
                } else {
                    console.log(chalk.yellow('⚠️  AWS response did not contain project_id'));
                }
            } catch (awsErr) {
                console.log(chalk.yellow('⚠️  Failed to store configuration in AWS:'), awsErr.message);
                console.log(chalk.gray('Your local configuration is still saved and functional.'));
            }
            
        } catch (err) {
            console.log(chalk.yellow('⚠️  Jira connection test failed:'), err.message);
            console.log(chalk.gray('Please verify your credentials and try again.'));
        }
    } else {
        console.log(chalk.red('❌ Failed to save Jira configuration.'));
    }
}

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

        const config = loadConfig();
        config.lintUrl = answers.lintUrl;
        saveConfig(config);

        execSync(`git config devguardian.lintUrl "${answers.lintUrl}"`);
        console.log(chalk.gray('  -> Saved Linter URL to git config.'));
        console.log(chalk.gray('  -> Saved Linter URL to global config.'));

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
        
        // Save review URL to global config
        const config = loadConfig();
        config.reviewUrl = 'https://github.com/your-repo'; // This would be set by user
        saveConfig(config);
        
        console.log(chalk.green('✅ PR Reviewer workflow file created successfully!'));
        console.log(chalk.yellow('\nAction Required: To complete setup, please go to your GitHub repository settings'));
        console.log(chalk.yellow('and add a new repository secret named "DEVGUARDIAN_REVIEW_URL" with the URL to your analysis endpoint.'));
        return true;
    } catch (err) {
        console.error(chalk.red('Failed to create PR Reviewer workflow file:'), err);
        return false;
    }
}

// Sync Jira configuration with AWS Secrets Manager
async function syncJiraWithAWS() {
    const { default: chalk } = await import('chalk');
    
    console.log(chalk.blue('Syncing Jira configuration with AWS Secrets Manager...'));
    
    const config = loadConfig();
    if (!config.jira || !config.jira.apiKey) {
        console.log(chalk.red('❌ Jira configuration not found. Please run "devguardian config jira" first.'));
        return;
    }
    
    try {
        const axios = require('axios');
        const awsResponse = await axios.post('https://6zgllvkz94.execute-api.af-south-1.amazonaws.com/dev/registerProject', {
            baseUrl: config.jira.baseUrl,
            email: config.jira.email,
            apiKey: config.jira.apiKey,
            projectKey: config.jira.projectKey
        });
        
        if (awsResponse.data && awsResponse.data.project_id) {
            // Update the project_id in local config
            config.project_id = awsResponse.data.project_id;
            saveConfig(config);
            
            console.log(chalk.green('✅ Configuration synced with AWS Secrets Manager successfully!'));
            console.log(chalk.gray('Project ID:'), awsResponse.data.project_id);
        } else {
            console.log(chalk.yellow('⚠️  AWS response did not contain project_id'));
        }
    } catch (awsErr) {
        console.log(chalk.red('❌ Failed to sync with AWS:'), awsErr.message);
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
        .command('config', 'Manage DevGuardian configuration', {
            jira: {
                type: 'boolean',
                describe: 'Configure Jira integration settings'
            },
            show: {
                type: 'boolean',
                describe: 'Show current configuration'
            },
            sync: {
                type: 'boolean',
                describe: 'Sync Jira configuration with AWS Secrets Manager'
            }
        }, async (argv) => {
            if (argv.show) {
                const config = loadConfig();
                displayConfig(config);
                return;
            }
            
            if (argv.jira) {
                await configureJira();
                return;
            }

            if (argv.sync) {
                await syncJiraWithAWS();
                return;
            }
            
            // Interactive config menu
            const config = loadConfig();
            displayConfig(config);
            
            const { action } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'action',
                    message: 'What would you like to configure?',
                    choices: [
                        { name: 'Configure Jira Integration', value: 'jira' },
                        { name: 'Show Current Configuration', value: 'show' },
                        { name: 'Sync with AWS Secrets Manager', value: 'sync' },
                        { name: 'Exit', value: 'exit' }
                    ]
                }
            ]);
            
            if (action === 'jira') {
                await configureJira();
            } else if (action === 'show') {
                displayConfig(config);
            } else if (action === 'sync') {
                await syncJiraWithAWS();
            }
        })
        .command('jira', 'Quick access to Jira configuration', {}, async (argv) => {
            await configureJira();
        })
        .command('sync', 'Sync Jira configuration with AWS Secrets Manager', {}, async (argv) => {
            await syncJiraWithAWS();
        })
        .demandCommand(1, 'Please specify a command. Try "init", "config", "jira", or "sync".')
        .help()
        .argv;
}


main().catch(err => {
    console.error('An unexpected error occurred:', err);
    process.exit(1);
});