/**
 * Git Utilities — Detect current branch and workspace context.
 */

import { exec } from 'child_process';

/**
 * Get the current git branch name for a workspace folder.
 * Returns null if not a git repo or git is not available.
 */
export function getCurrentBranch(workspacePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    exec(
      'git rev-parse --abbrev-ref HEAD',
      { cwd: workspacePath, timeout: 5000 },
      (error: Error | null, stdout: string) => {
        if (error) {
          resolve(null);
          return;
        }
        const branch = stdout.trim();
        resolve(branch || null);
      }
    );
  });
}

/**
 * Check if a directory is inside a git repository.
 */
export function isGitRepo(workspacePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    exec(
      'git rev-parse --is-inside-work-tree',
      { cwd: workspacePath, timeout: 5000 },
      (error: Error | null, stdout: string) => {
        resolve(!error && stdout.trim() === 'true');
      }
    );
  });
}
