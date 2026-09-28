/**
 * TemplateService — Manages built-in and workspace-specific note templates.
 * Loads templates, handles variable substitution, and lists available templates.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TemplateInfo } from '../models/types';
import { ConfigService } from './configService';
import { toISOString } from '../utils/dateUtils';
import { getCurrentBranch } from '../utils/gitUtils';

export class TemplateService {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly workspacePath: string,
    private readonly configService: ConfigService
  ) {}

  /**
   * List all available templates (built-in + workspace custom).
   */
  async listTemplates(): Promise<TemplateInfo[]> {
    const templates: TemplateInfo[] = [];

    // 1. Built-in templates
    const builtInTemplates: TemplateInfo[] = [
      {
        id: 'meeting-notes',
        name: '📅 Meeting Notes',
        description: 'Agenda, attendee list, key discussion points, and action items',
        file: 'meeting-notes.md',
        builtIn: true,
      },
      {
        id: 'bug-report',
        name: '🐛 Bug Investigation & Report',
        description: 'Reproduction steps, expected behavior, root cause, and fix checklist',
        file: 'bug-report.md',
        builtIn: true,
      },
      {
        id: 'daily-standup',
        name: '☀️ Daily Standup',
        description: 'Yesterday, today, blockers, and quick reflections',
        file: 'daily-standup.md',
        builtIn: true,
      },
      {
        id: 'architecture-decision',
        name: '🏛️ Architecture Decision Record (ADR)',
        description: 'Context, decision drivers, options, chosen architecture, consequences',
        file: 'architecture-decision.md',
        builtIn: true,
      },
      {
        id: 'code-review',
        name: '🔍 Code Review Notes',
        description: 'PR objectives, component-by-component feedback, test plan verification',
        file: 'code-review.md',
        builtIn: true,
      },
      {
        id: 'experiment-log',
        name: '🧪 Spike & Experiment Log',
        description: 'Hypothesis, goal, experimental setup, observations, and conclusions',
        file: 'experiment-log.md',
        builtIn: true,
      },
    ];

    templates.push(...builtInTemplates);

    // 2. Custom templates from .notes/.templates/
    const customTemplatesDir = path.join(this.workspacePath, '.notes', '.templates');
    if (fs.existsSync(customTemplatesDir)) {
      try {
        const files = fs.readdirSync(customTemplatesDir);
        for (const file of files) {
          if (file.endsWith('.md') || file.endsWith('.txt')) {
            const id = `custom-${path.basename(file, path.extname(file))}`;
            const name = `📄 ${path.basename(file, path.extname(file)).replace(/[-_]/g, ' ')}`;
            templates.push({
              id,
              name,
              description: 'Custom workspace template',
              file: path.join('.templates', file),
              builtIn: false,
            });
          }
        }
      } catch (err) {
        console.error('[NotePad] Error reading custom templates:', err);
      }
    }

    return templates;
  }

  /**
   * Get raw content of a template by ID.
   */
  async getTemplateContent(templateId: string): Promise<string> {
    const templates = await this.listTemplates();
    const template = templates.find((t) => t.id === templateId);

    if (!template) {
      throw new Error(`Template "${templateId}" not found`);
    }

    if (template.builtIn && template.file) {
      const templatePath = path.join(this.extensionUri.fsPath, 'templates', template.file);
      if (fs.existsSync(templatePath)) {
        return fs.readFileSync(templatePath, 'utf-8');
      }
    } else if (template.file) {
      const customPath = path.join(this.workspacePath, '.notes', template.file);
      if (fs.existsSync(customPath)) {
        return fs.readFileSync(customPath, 'utf-8');
      }
    }

    throw new Error(`Template content not found for "${templateId}"`);
  }

  /**
   * Instantiate template with substituted variables.
   */
  async instantiateTemplate(
    templateId: string,
    title: string
  ): Promise<string> {
    const rawContent = await this.getTemplateContent(templateId);
    const branch = await getCurrentBranch(this.workspacePath);
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5);
    const workspaceName = path.basename(this.workspacePath);

    return rawContent
      .replace(/\{\{title\}\}/g, title)
      .replace(/\{\{date\}\}/g, dateStr)
      .replace(/\{\{time\}\}/g, timeStr)
      .replace(/\{\{branch\}\}/g, branch || 'main')
      .replace(/\{\{workspace\}\}/g, workspaceName)
      .replace(/\{\{author\}\}/g, process.env.USERNAME || process.env.USER || 'Developer');
  }
}
