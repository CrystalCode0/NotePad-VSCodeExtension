/**
 * UpdateService — Checks GitHub Releases for new extension versions
 * and automatically downloads and installs .vsix packages.
 */

import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  html_url: string;
  body: string;
  assets: GitHubAsset[];
}

export class UpdateService {
  private readonly repo: string = 'CrystalCode0/NotePad-VSCodeExtension';

  constructor(private readonly currentVersion: string) {}

  /**
   * Check for updates.
   * @param isManual If true, shows feedback even if no update is available or if offline.
   */
  public async checkForUpdates(isManual: boolean = false): Promise<void> {
    try {
      if (isManual) {
        vscode.window.setStatusBarMessage('$(sync~spin) NotePad: Checking for updates...', 3000);
      }

      const release = await this.fetchLatestRelease();
      if (!release) {
        if (isManual) {
          vscode.window.showInformationMessage('NotePad: Unable to check for updates. Check your internet connection.');
        }
        return;
      }

      const latestVersion = release.tag_name.replace(/^v/, '').trim();
      const hasUpdate = this.isNewer(latestVersion, this.currentVersion);

      if (!hasUpdate) {
        if (isManual) {
          vscode.window.showInformationMessage(`NotePad is up to date (v${this.currentVersion}).`);
        }
        return;
      }

      // Find the .vsix asset
      const vsixAsset = release.assets.find((a) => a.name.toLowerCase().endsWith('.vsix'));

      const choice = await vscode.window.showInformationMessage(
        `🚀 NotePad v${latestVersion} is available! (Current: v${this.currentVersion})`,
        vsixAsset ? 'Update Now' : 'View on GitHub',
        'Release Notes',
        'Later'
      );

      if (choice === 'Release Notes' || (choice === 'View on GitHub' && !vsixAsset)) {
        vscode.env.openExternal(vscode.Uri.parse(release.html_url));
      } else if (choice === 'Update Now' && vsixAsset) {
        await this.installUpdate(vsixAsset.browser_download_url, latestVersion);
      }
    } catch (err: any) {
      if (isManual) {
        vscode.window.showErrorMessage(`NotePad Update Error: ${err.message}`);
      }
      console.error('[NotePad UpdateService]', err);
    }
  }

  /**
   * Downloads the .vsix from GitHub and installs it via VS Code command.
   */
  private async installUpdate(downloadUrl: string, latestVersion: string): Promise<void> {
    const tempFile = path.join(os.tmpdir(), `notepad-${latestVersion}-${Date.now()}.vsix`);

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Updating NotePad to v${latestVersion}...`,
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: 'Downloading package...' });

          await this.download(downloadUrl, tempFile, (percent) => {
            progress.report({ message: `Downloading... ${percent}%` });
          });

          progress.report({ message: 'Installing into VS Code...' });
          await vscode.commands.executeCommand(
            'workbench.extensions.installExtension',
            vscode.Uri.file(tempFile)
          );
        }
      );

      const action = await vscode.window.showInformationMessage(
        `🎉 NotePad has been updated to v${latestVersion}! Reload VS Code to apply.`,
        'Reload Window'
      );

      if (action === 'Reload Window') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to install NotePad update: ${err.message}`);
    } finally {
      // Clean up temporary vsix
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch {
        // Ignore file cleanup failure
      }
    }
  }

  /**
   * Fetches latest release JSON from GitHub API.
   */
  private fetchLatestRelease(): Promise<GitHubRelease | null> {
    return new Promise((resolve) => {
      const url = `https://api.github.com/repos/${this.repo}/releases/latest`;
      const options: https.RequestOptions = {
        headers: {
          'User-Agent': 'NotePad-VSCodeExtension',
          Accept: 'application/vnd.github.v3+json',
        },
      };

      const req = https.get(url, options, (res) => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }

        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.setTimeout(8000, () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  /**
   * Downloads a remote file, following redirects up to 5 levels.
   */
  private download(
    targetUrl: string,
    destPath: string,
    onProgress?: (percentage: number) => void,
    redirectCount: number = 0
  ): Promise<void> {
    if (redirectCount > 5) {
      return Promise.reject(new Error('Too many HTTP redirects'));
    }

    return new Promise((resolve, reject) => {
      const isHttps = targetUrl.startsWith('https:');
      const client = isHttps ? https : http;

      const req = client.get(
        targetUrl,
        {
          headers: {
            'User-Agent': 'NotePad-VSCodeExtension',
          },
        },
        (res) => {
          // Handle 3xx redirects
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            this.download(res.headers.location, destPath, onProgress, redirectCount + 1)
              .then(resolve)
              .catch(reject);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Download failed with status ${res.statusCode}`));
            return;
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let receivedBytes = 0;
          const fileStream = fs.createWriteStream(destPath);

          res.on('data', (chunk) => {
            receivedBytes += chunk.length;
            if (totalBytes > 0 && onProgress) {
              onProgress(Math.round((receivedBytes / totalBytes) * 100));
            }
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });

          fileStream.on('error', (err) => {
            try {
              if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
            } catch {}
            reject(err);
          });
        }
      );

      req.on('error', (err) => {
        try {
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        } catch {}
        reject(err);
      });
    });
  }

  /**
   * Returns true if latest version is strictly greater than current version.
   */
  public isNewer(latest: string, current: string): boolean {
    const parse = (v: string) =>
      v
        .replace(/^v/, '')
        .split('.')
        .map((num) => parseInt(num, 10) || 0);

    const [lMaj = 0, lMin = 0, lPatch = 0] = parse(latest);
    const [cMaj = 0, cMin = 0, cPatch = 0] = parse(current);

    if (lMaj !== cMaj) return lMaj > cMaj;
    if (lMin !== cMin) return lMin > cMin;
    return lPatch > cPatch;
  }
}
