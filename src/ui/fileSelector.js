/**
 * Interactive File Selector
 * Simple: type to filter → space to tick → enter when done
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { readdirSync } from 'fs';
import { join, relative, sep } from 'path';

// Directories to always ignore
const IGNORE_DIRS = new Set([
    'node_modules', '.git', '.svn', '.hg', '.DS_Store', 'Thumbs.db',
    '.idea', '.vscode', '__pycache__', '.pytest_cache', 'dist', 'build',
    '.next', '.nuxt', 'coverage', '.nyc_output', '.repo-cloak-map.json',
    'obj', 'bin', 'packages', '.vs', 'TestResults'
]);

function shouldIgnore(name) {
    return IGNORE_DIRS.has(name) || name.startsWith('.');
}

/**
 * Build file index
 */
function buildFileIndex(baseDir, maxDepth = 8) {
    const files = [];

    function scan(dir, depth = 0) {
        if (depth > maxDepth) return;

        try {
            const entries = readdirSync(dir, { withFileTypes: true });

            // Sort: folders first, then files
            entries.sort((a, b) => {
                if (a.isDirectory() && !b.isDirectory()) return -1;
                if (!a.isDirectory() && b.isDirectory()) return 1;
                return a.name.localeCompare(b.name);
            });

            for (const entry of entries) {
                if (shouldIgnore(entry.name)) continue;

                const fullPath = join(dir, entry.name);
                const relativePath = relative(baseDir, fullPath);

                files.push({
                    name: entry.name,
                    path: fullPath,
                    relativePath,
                    isDirectory: entry.isDirectory()
                });

                if (entry.isDirectory()) {
                    scan(fullPath, depth + 1);
                }
            }
        } catch (error) { }
    }

    scan(baseDir);
    return files;
}

/**
 * Get all files in a directory recursively  
 */
function getFilesInDirectory(dir) {
    const files = [];

    function collect(currentDir) {
        try {
            const entries = readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                if (shouldIgnore(entry.name)) continue;
                const fullPath = join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    collect(fullPath);
                } else {
                    files.push(fullPath);
                }
            }
        } catch (error) { }
    }

    collect(dir);
    return files;
}

/**
 * Format item for checkbox display
 */
function formatItem(item, depth = 0) {
    const indent = '  '.repeat(depth);
    const icon = item.isDirectory ? '📁' : '📄';
    const name = item.isDirectory
        ? chalk.blue.bold(item.name + sep)
        : chalk.white(item.name);
    return `${indent}${icon} ${name}`;
}

/**
 * Main file selector - simple checkbox with search loop
 */
export async function selectFiles(sourceDir) {
    console.log(chalk.cyan('\n📂 Scanning directory...'));

    const fileIndex = buildFileIndex(sourceDir);
    console.log(chalk.dim(`   Found ${fileIndex.length} items\n`));

    if (fileIndex.length === 0) {
        console.log(chalk.yellow('   No files found.'));
        return [];
    }

    const selectedPaths = new Set();
    let continueLoop = true;

    console.log(chalk.cyan('🔍 File Selection'));
    console.log(chalk.dim('   1. Type a search term to filter'));
    console.log(chalk.dim('   2. Space to tick, Enter to confirm'));
    console.log(chalk.dim('   3. Empty search + Enter = finish\n'));

    while (continueLoop) {
        // Show current count
        if (selectedPaths.size > 0) {
            console.log(chalk.green(`\n   📦 ${selectedPaths.size} file(s) selected so far`));
        }

        // Get search term
        const { searchTerm } = await inquirer.prompt([
            {
                type: 'input',
                name: 'searchTerm',
                message: 'Filter (empty = done):',
                prefix: '🔎'
            }
        ]);

        // Empty = done
        if (!searchTerm.trim()) {
            if (selectedPaths.size === 0) {
                const { confirmExit } = await inquirer.prompt([
                    { type: 'confirm', name: 'confirmExit', message: 'No files selected. Exit?', default: false }
                ]);
                if (confirmExit) {
                    continueLoop = false;
                }
            } else {
                continueLoop = false;
            }
            continue;
        }

        // Filter files by search term
        const query = searchTerm.toLowerCase();
        const filtered = fileIndex.filter(f =>
            f.relativePath.toLowerCase().includes(query) ||
            f.name.toLowerCase().includes(query)
        );

        if (filtered.length === 0) {
            console.log(chalk.yellow('   No matches. Try different search.'));
            continue;
        }

        // Show checkbox for filtered items
        const choices = filtered.slice(0, 50).map(f => ({
            name: `${f.isDirectory ? '📁' : '📄'} ${f.relativePath}`,
            value: f,
            checked: selectedPaths.has(f.path)
        }));

        const { picked } = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'picked',
                message: `Matches (${filtered.length}):`,
                choices,
                pageSize: 20
            }
        ]);

        // Update selections
        // First, remove any previously selected items in this filtered set that are now unchecked
        for (const f of filtered.slice(0, 50)) {
            if (f.isDirectory) {
                const filesInDir = getFilesInDirectory(f.path);
                filesInDir.forEach(fp => selectedPaths.delete(fp));
            } else {
                selectedPaths.delete(f.path);
            }
        }

        // Add newly selected items
        for (const f of picked) {
            if (f.isDirectory) {
                const filesInDir = getFilesInDirectory(f.path);
                filesInDir.forEach(fp => selectedPaths.add(fp));
                console.log(chalk.green(`   + ${filesInDir.length} files from ${f.relativePath}/`));
            } else {
                selectedPaths.add(f.path);
                console.log(chalk.green(`   + ${f.relativePath}`));
            }
        }
    }

    console.log(chalk.green(`\n✓ Selected ${selectedPaths.size} files total\n`));
    return Array.from(selectedPaths);
}
