/**
 * Pull Command
 * Extract files and anonymize sensitive information
 * Supports quick-add mode when pulling to existing cloaked directory
 */

import ora from 'ora';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { existsSync, mkdirSync } from 'fs';
import { resolve, relative } from 'path';

import { selectFiles } from '../ui/fileSelector.js';
import {
    promptSourceDirectory,
    promptDestinationDirectory,
    promptKeywordReplacements,
    showSummaryAndConfirm,
    confirmAction
} from '../ui/prompts.js';
import { showSuccess, showError, showInfo } from '../ui/banner.js';
import { getAllFiles } from '../core/scanner.js';
import { copyFiles } from '../core/copier.js';
import { createAnonymizer } from '../core/anonymizer.js';
import { createMapping, saveMapping, loadRawMapping, mergeMapping, hasMapping, decryptMapping } from '../core/mapper.js';
import { getOrCreateSecret, hasSecret, decryptReplacements } from '../core/crypto.js';
import { isGitRepo, getChangedFiles } from '../core/git.js';

export async function pull(options = {}) {
    try {
        let destDir = null;
        let existingMapping = null;
        let existingReplacements = [];
        let sourceDir = null;
        let isQuickAdd = false;

        // Step 1: Check if current directory is already a cloaked directory
        const currentDir = process.cwd();

        if (hasMapping(currentDir) && !options.dest) {
            // Running from inside an existing cloaked directory - auto-detect!
            destDir = currentDir;
            existingMapping = loadRawMapping(destDir);

            console.log(chalk.cyan('\n   Existing cloaked directory detected'));
            console.log(chalk.dim(`   Created: ${existingMapping.timestamp}`));
            console.log(chalk.dim(`   Files: ${existingMapping.stats?.totalFiles || existingMapping.files?.length || 0}`));
            console.log(chalk.dim(`   Replacements: ${existingMapping.replacements?.length || 0}\n`));

            // Ask if they want quick-add mode
            const { mode } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'mode',
                    message: 'What would you like to do?',
                    choices: [
                        {
                            name: 'Quick Add - Use existing replacements and add more files',
                            value: 'quick'
                        },
                        {
                            name: 'Add More Replacements - Add files with additional anonymization',
                            value: 'extend'
                        },
                        {
                            name: 'Fresh Start - Choose new destination',
                            value: 'fresh'
                        }
                    ]
                }
            ]);

            if (mode === 'fresh') {
                // Get a new destination
                destDir = await promptDestinationDirectory();
                existingMapping = null;
            } else {
                isQuickAdd = mode === 'quick';

                // Decrypt existing replacements
                if (existingMapping.encrypted && hasSecret()) {
                    const secret = getOrCreateSecret();
                    try {
                        const decrypted = decryptReplacements(existingMapping.replacements || [], secret);
                        existingReplacements = decrypted.filter(r => !r.decryptFailed);

                        if (existingReplacements.length > 0) {
                            console.log(chalk.green('   Existing replacements loaded:\n'));
                            existingReplacements.forEach(r => {
                                console.log(chalk.dim(`      "${r.original}" → "${r.replacement}"`));
                            });
                            console.log('');
                        }
                    } catch (err) {
                        console.log(chalk.yellow('   Could not decrypt existing replacements'));
                    }
                }

                // Try to get original source path
                if (existingMapping.encrypted && hasSecret()) {
                    const secret = getOrCreateSecret();
                    try {
                        const decrypted = decryptMapping(existingMapping, secret);
                        if (decrypted.source?.path && existsSync(decrypted.source.path)) {
                            sourceDir = decrypted.source.path;
                            console.log(chalk.dim(`   Source: ${sourceDir}\n`));
                        }
                    } catch (err) {
                        // Source path couldn't be decrypted, will prompt
                    }
                }
            }
        } else {
            // Not running from a cloaked directory - ask for destination
            destDir = options.dest
                ? resolve(options.dest)
                : await promptDestinationDirectory();

            // Check if the chosen destination has an existing mapping
            if (existsSync(destDir) && hasMapping(destDir)) {
                existingMapping = loadRawMapping(destDir);

                console.log(chalk.cyan('\n   Existing cloaked directory detected'));
                console.log(chalk.dim(`   Created: ${existingMapping.timestamp}`));
                console.log(chalk.dim(`   Files: ${existingMapping.stats?.totalFiles || existingMapping.files?.length || 0}`));
                console.log(chalk.dim(`   Replacements: ${existingMapping.replacements?.length || 0}\n`));

                // Ask if they want quick-add mode
                const { mode } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'mode',
                        message: 'What would you like to do?',
                        choices: [
                            { name: 'Quick Add - Use existing replacements and add more files', value: 'quick' },
                            { name: 'Add More Replacements - Add files with additional anonymization', value: 'extend' },
                            { name: 'Fresh Start - Choose new destination', value: 'fresh' }
                        ]
                    }
                ]);

                if (mode === 'fresh') {
                    destDir = await promptDestinationDirectory();
                    existingMapping = null;
                } else {
                    isQuickAdd = mode === 'quick';

                    // Decrypt existing replacements
                    if (existingMapping.encrypted && hasSecret()) {
                        const secret = getOrCreateSecret();
                        try {
                            const decrypted = decryptReplacements(existingMapping.replacements || [], secret);
                            existingReplacements = decrypted.filter(r => !r.decryptFailed);

                            if (existingReplacements.length > 0) {
                                console.log(chalk.green('   Existing replacements loaded:\n'));
                                existingReplacements.forEach(r => {
                                    console.log(chalk.dim(`      "${r.original}" → "${r.replacement}"`));
                                });
                                console.log('');
                            }
                        } catch (err) {
                            console.log(chalk.yellow('   Could not decrypt existing replacements'));
                        }
                    }

                    // Try to get original source path
                    if (existingMapping.encrypted && hasSecret()) {
                        const secret = getOrCreateSecret();
                        try {
                            const decrypted = decryptMapping(existingMapping, secret);
                            if (decrypted.source?.path && existsSync(decrypted.source.path)) {
                                sourceDir = decrypted.source.path;
                                console.log(chalk.dim(`   Source: ${sourceDir}\n`));
                            }
                        } catch (err) {
                            // Source path couldn't be decrypted, will prompt
                        }
                    }
                }
            }
        }

        // ...

        // Step 3: Get source directory if not already determined
        if (!sourceDir) {
            sourceDir = options.source
                ? resolve(options.source)
                : await promptSourceDirectory();
        }

        if (!existsSync(sourceDir)) {
            showError(`Source directory does not exist: ${sourceDir}`);
            return;
        }

        console.log(chalk.dim(`   Source: ${sourceDir}\n`));

        // Step 4: Select files (Check for Git integration first)
        let selectedFiles = [];
        let useGitFiles = false;

        if (isGitRepo(sourceDir)) {
            const { useGit } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'useGit',
                    message: 'Git repository detected. Do you want to select changed/added files?',
                    default: false
                }
            ]);

            if (useGit) {
                const spinner = ora('Scanning changed files...').start();
                const gitFiles = await getChangedFiles(sourceDir);
                spinner.stop();

                if (gitFiles.length === 0) {
                    console.log(chalk.yellow('   No changed or added files found in Git status.'));
                    const { fallback } = await inquirer.prompt([
                        {
                            type: 'confirm',
                            name: 'fallback',
                            message: 'Do you want to manually select files instead?',
                            default: true
                        }
                    ]);

                    if (!fallback) {
                        return;
                    }
                } else {
                    // Filter to absolute paths and exist check
                    const validGitFiles = gitFiles
                        .map(f => resolve(sourceDir, f))
                        .filter(f => existsSync(f));

                    if (validGitFiles.length > 0) {
                        console.log(chalk.green(`   Found ${validGitFiles.length} changed files.`));

                        // Let user confirm/deselect git files
                        const { confirmGitFiles } = await inquirer.prompt([
                            {
                                type: 'checkbox',
                                name: 'confirmGitFiles',
                                message: 'Select changed files to extract:',
                                choices: validGitFiles.map(f => ({
                                    name: relative(sourceDir, f),
                                    value: f,
                                    checked: true
                                }))
                            }
                        ]);

                        selectedFiles = confirmGitFiles;
                        useGitFiles = true;
                    }
                }
            }
        }

        if (!useGitFiles || selectedFiles.length === 0) {
            selectedFiles = await selectFiles(sourceDir);
        }

        if (selectedFiles.length === 0) {
            showError('No files selected. Aborting.');
            return;
        }

        console.log(chalk.green(`\n✓ Selected ${selectedFiles.length} files\n`));

        // Step 5: Handle replacements based on mode
        let replacements = [...existingReplacements];

        if (isQuickAdd) {
            // Quick add mode - just use existing replacements
            if (replacements.length > 0) {
                console.log(chalk.cyan('   Using existing replacements (quick-add mode)\n'));
            }

            // Ask if they want to add more
            const { addMore } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'addMore',
                    message: 'Add additional replacements?',
                    default: false
                }
            ]);

            if (addMore) {
                const additionalReplacements = await promptKeywordReplacements();
                replacements = [...replacements, ...additionalReplacements];
            }
        } else if (existingMapping) {
            // Extend mode - prompt for more replacements to add to existing
            console.log(chalk.cyan('\n   Add more replacements (existing will be preserved):\n'));
            const additionalReplacements = await promptKeywordReplacements();
            replacements = [...replacements, ...additionalReplacements];
        } else {
            // Fresh start - prompt for all replacements
            replacements = await promptKeywordReplacements();
        }

        // Step 6: Confirm
        const confirmed = await showSummaryAndConfirm(
            selectedFiles.length,
            destDir,
            replacements
        );

        if (!confirmed) {
            showInfo('Operation cancelled.');
            return;
        }

        // Step 7: Create destination directory
        if (!existsSync(destDir)) {
            mkdirSync(destDir, { recursive: true });
            console.log(chalk.dim(`   Created directory: ${destDir}`));
        }

        // Step 8: Copy and anonymize files
        const spinner = ora('Copying and anonymizing files...').start();

        const anonymizer = createAnonymizer(replacements);
        let lastFile = '';

        const results = await copyFiles(
            selectedFiles,
            sourceDir,
            destDir,
            anonymizer,
            (current, total, file) => {
                lastFile = file;
                spinner.text = `Copying files... ${current}/${total} - ${file}`;
            },
            replacements  // Pass replacements for path anonymization
        );

        spinner.succeed(`Copied ${results.copied} files`);

        if (results.pathsRenamed > 0) {
            console.log(chalk.cyan(`   📁 ${results.pathsRenamed} paths renamed`));
        }

        if (results.transformed > 0) {
            console.log(chalk.cyan(`   📝 ${results.transformed} files had content replaced`));
        }

        if (results.errors.length > 0) {
            console.log(chalk.yellow(`   ⚠️  ${results.errors.length} files had errors`));
            results.errors.forEach(e => {
                console.log(chalk.dim(`      - ${e.file}: ${e.error}`));
            });
        }

        // Step 9: Prepare new file mappings
        const newFiles = selectedFiles.map(f => {
            const originalPath = relative(sourceDir, f);
            let anonymizedPath = originalPath;
            for (const { original, replacement } of replacements) {
                const regex = new RegExp(original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                anonymizedPath = anonymizedPath.replace(regex, replacement);
            }
            return {
                original: originalPath,
                cloaked: anonymizedPath
            };
        });

        // Step 10: Check for existing mapping and merge if found
        let mapping;
        let isIncremental = false;

        if (existingMapping) {
            // Merge with existing
            mapping = mergeMapping(existingMapping, newFiles);
            isIncremental = true;
            console.log(chalk.cyan(`   🔄 Merged with existing mapping`));
        } else {
            // Create new mapping
            mapping = createMapping({
                sourceDir,
                destDir,
                replacements,
                files: newFiles
            });
        }

        const mapPath = saveMapping(destDir, mapping);

        if (isIncremental) {
            const history = mapping.pullHistory || [];
            const lastPull = history[history.length - 1];
            console.log(chalk.dim(`   📋 Mapping updated: ${lastPull?.filesAdded || 0} new files added (total: ${mapping.stats?.totalFiles})`));
        } else {
            console.log(chalk.dim(`   📋 Mapping saved: ${mapPath}`));
        }

        // Done!
        showSuccess('Extraction complete!');
        console.log(chalk.white(`   📂 Files extracted to: ${chalk.cyan.bold(destDir)}`));

        if (isQuickAdd || isIncremental) {
            console.log(chalk.dim(`\n   Tip: Run again to add more files quickly\n`));
        } else {
            console.log(chalk.dim(`\n   To restore later, run: ${chalk.white('repo-cloak push')}\n`));
        }

    } catch (error) {
        showError(`Pull failed: ${error.message}`);
        if (process.env.DEBUG) {
            console.error(error);
        }
    }
}
