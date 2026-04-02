import {BindingScope, injectable, service} from '@loopback/core';
import {GithubService} from './github-integration/github.service';
import {OllamaService} from './ollama.service';
import {
  type IssuePriority,
  ISSUE_PRIORITY_VALUES,
} from './issue-priority.service';

export type PullRequestMergeRiskPrediction = {
  priority: IssuePriority;
  reason: string;
  findings: PullRequestReviewFinding[];
};

export type PullRequestReviewFinding = {
  path: string;
  line: number;
  body: string;
  lineContent?: string;
};

type PredictPullRequestMergeRiskInput = {
  installationId?: number | null;
  repositoryFullName: string;
  pullRequestNumber: number;
  title: string;
  description: string | null;
};

type PullRequestMergeRiskAiResponse =
  | {
      type: 'tool_call';
      tool: string;
      arguments?: Record<string, unknown>;
      reason?: string;
    }
  | {
      type: 'final';
      priority?: string;
      reason?: string;
      findings?: Array<{
        path?: string;
        line?: number;
        body?: string;
        line_content?: string;
      }>;
    };

type PullRequestToolName =
  | 'get_pull_request_overview'
  | 'list_pull_request_files'
  | 'grep_pull_request_changes'
  | 'get_pull_request_file_contents';

type PullRequestMergeRiskMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const MAX_TOOL_CALLS = 4;
const MAX_GREP_MATCHES = 8;
const MAX_FILE_LIST_RESULTS = 25;
const MAX_FILE_CONTENT_LENGTH = 6000;
const MAX_PATCH_SNIPPET_LENGTH = 1200;
const MAX_INITIAL_FILE_EVIDENCE = 10;
const MAX_REVIEW_FINDINGS = 5;
const MAX_REVIEW_COMMENT_BODY_LENGTH = 240;

const MERGE_RISK_PROMPT = `You are a senior software reliability engineer evaluating pull request merge risk.

Your job is to classify the merge risk of a pull request using exactly one of:
- Unknown
- Low
- Medium
- High
- Very-High

Think about operational risk, regression risk, blast radius, and how risky it is to merge this PR.
Use only facts that are explicitly available in the pull request context or from tools.
Do not invent missing details.
You MUST inspect the changed-file evidence before returning a final answer.
Do not rely on only the title or description when file-level evidence is available.

Your final reason must be grounded in concrete changed-code evidence.
When file-level evidence is available, explicitly pinpoint the riskiest code by naming the file path and the faulty or risky logic involved, such as a changed guard, condition, query, migration, API contract, or shared control flow.
If a patch snippet or fetched file content shows a specific risky line or block, mention that pinpoint briefly in the reason.
Prefer 1-3 concrete pinpoints over generic statements like "auth changes are risky."
If no concrete code pinpoint is available, say that the risk is inferred from the changed surface area alone.

You are also acting as a focused AI code reviewer.
Report only concrete, actionable defects that are likely bugs, regressions, unsafe behavior, broken assumptions, or risky omissions.
Do NOT report style nits, naming preferences, or speculative architecture opinions.
Only produce review findings when there is enough changed-code evidence to support them.
Each review finding must point to a changed line in the current diff and include a very short explanation of why it is a problem.
Use the exact new-side line number from the diff annotations you are given.
Anchor each finding to the most specific changed line that introduces the problem, not just a nearby line in the same hunk.
If the problem spans multiple changed lines, choose the single changed line that best represents the defecting logic.
Include the exact changed code line as "line_content" so the review comment can be anchored to the intended statement.
Include "line_content" whenever possible. If you are unsure, prefer an exact changed line number over guessing a nearby line.
Return at most 5 review findings.

Risk definitions:
- Unknown: not enough concrete information to judge safely.
- Low: docs, comments, tests-only, or a tightly scoped low-impact change.
- Medium: a contained feature/module change with moderate blast radius.
- High: a broad or tricky change that affects critical paths, shared modules, APIs, data handling, or many files.
- Very-High: security/authentication/authorization, migrations, payments, infrastructure, large cross-cutting changes, or anything with severe rollback risk.

You may use tools when you need more information.
Prefer to finish without tools when the provided context is already enough.

When you want to use a tool, return ONLY JSON like:
{
  "type": "tool_call",
  "tool": "<tool name>",
  "arguments": { ... },
  "reason": "<why you need it>"
}

Available tools:
- get_pull_request_overview: no arguments
- list_pull_request_files: optional arguments { "limit": number }
- grep_pull_request_changes: required arguments { "query": string, "limit"?: number }
- get_pull_request_file_contents: required arguments { "path": string }

When you are done, return ONLY JSON like:
{
  "type": "final",
  "priority": "<Unknown|Low|Medium|High|Very-High>",
  "reason": "<short explanation with concrete faulty-code pinpoints when available>",
  "findings": [
    {
      "path": "<changed file path>",
      "line": <changed line number on the new side of the diff>,
      "body": "<very short review comment describing why this is a problem>",
      "line_content": "<the exact changed code line you are commenting on>"
    }
  ]
}`;

@injectable({scope: BindingScope.SINGLETON})
export class PullRequestMergeRiskService {
  constructor(
    @service(OllamaService) private ollamaService: OllamaService,
    @service(GithubService) private githubService: GithubService,
  ) {}

  public async predictMergeRisk({
    installationId,
    repositoryFullName,
    pullRequestNumber,
    title,
    description,
  }: PredictPullRequestMergeRiskInput): Promise<PullRequestMergeRiskPrediction> {
    const messages: PullRequestMergeRiskMessage[] = [
      {
        role: 'system',
        content: MERGE_RISK_PROMPT,
      },
      {
        role: 'user',
        content: [
          `Repository: ${repositoryFullName}`,
          `Pull request number: ${pullRequestNumber}`,
          `Title: ${title}`,
          `Description:\n${description?.trim() || '(empty)'}`,
        ].join('\n'),
      },
    ];

    try {
      messages.push({
        role: 'user',
        content: await this.buildInitialEvidenceMessage({
          installationId,
          repositoryFullName,
          pullRequestNumber,
        }),
      });

      for (let iteration = 1; iteration <= MAX_TOOL_CALLS + 1; iteration += 1) {
        const response =
          await this.ollamaService.chatJson<PullRequestMergeRiskAiResponse>({
            messages,
          });

        if (response.type === 'final') {
          const prediction = this.normalizePrediction(response);

          console.log('Pull request merge risk prediction completed', {
            repositoryFullName,
            pullRequestNumber,
            priority: prediction.priority,
            iteration,
          });

          return prediction;
        }

        if (response.type !== 'tool_call') {
          messages.push({
            role: 'assistant',
            content: JSON.stringify(response),
          });
          messages.push({
            role: 'user',
            content:
              'Your response was invalid. Return either a tool_call JSON object or a final JSON object.',
          });
          continue;
        }

        if (iteration > MAX_TOOL_CALLS) {
          return this.fallbackPrediction(
            repositoryFullName,
            pullRequestNumber,
            new Error('AI exceeded the maximum number of tool calls'),
          );
        }

        const toolName = normalizeToolName(response.tool);

        if (!toolName) {
          console.warn('Pull request merge risk AI requested an unknown tool', {
            repositoryFullName,
            pullRequestNumber,
            tool: response.tool,
            iteration,
          });

          messages.push({
            role: 'assistant',
            content: JSON.stringify(response),
          });
          messages.push({
            role: 'user',
            content: `The tool "${response.tool}" is not available. Choose a listed tool or return a final answer.`,
          });
          continue;
        }

        console.log('Pull request merge risk AI requested tool', {
          repositoryFullName,
          pullRequestNumber,
          tool: toolName,
          toolReason: response.reason,
          toolArguments: response.arguments ?? {},
          iteration,
        });

        const toolResult = await this.executeTool(
          toolName,
          response.arguments ?? {},
          {
            installationId,
            repositoryFullName,
            pullRequestNumber,
          },
        );

        console.log('Pull request merge risk AI tool completed', {
          repositoryFullName,
          pullRequestNumber,
          tool: toolName,
          resultSummary: summarizeToolResult(toolResult),
          iteration,
        });

        messages.push({
          role: 'assistant',
          content: JSON.stringify(response),
        });
        messages.push({
          role: 'user',
          content: `Tool result for ${toolName}:\n${JSON.stringify(toolResult)}`,
        });
      }
    } catch (error) {
      return this.fallbackPrediction(
        repositoryFullName,
        pullRequestNumber,
        error,
      );
    }

    return this.fallbackPrediction(
      repositoryFullName,
      pullRequestNumber,
      new Error('AI did not return a final merge risk classification'),
    );
  }

  private async executeTool(
    toolName: PullRequestToolName,
    args: Record<string, unknown>,
    context: {
      installationId?: number | null;
      repositoryFullName: string;
      pullRequestNumber: number;
    },
  ): Promise<unknown> {
    if (!context.installationId) {
      return {
        error:
          'GitHub installation context is unavailable, so tools cannot be executed for this pull request.',
      };
    }

    switch (toolName) {
      case 'get_pull_request_overview':
        return this.githubService.getPullRequestOverview(
          context.installationId,
          context.repositoryFullName,
          context.pullRequestNumber,
        );
      case 'list_pull_request_files': {
        const limit = clampNumber(args.limit, 1, MAX_FILE_LIST_RESULTS, 15);
        const files = await this.githubService.listPullRequestFiles(
          context.installationId,
          context.repositoryFullName,
          context.pullRequestNumber,
        );

        return files.slice(0, limit).map(file => ({
          filename: file.filename,
          status: file.status,
          previous_filename: file.previous_filename ?? null,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
          commentable_lines: file.patch
            ? collectAddedLines(file.patch).map(line => ({
                line: line.lineNumber,
                content: line.content,
              }))
            : [],
          annotated_patch: file.patch
            ? renderAnnotatedPatch(file.patch, MAX_PATCH_SNIPPET_LENGTH)
            : '(not available)',
          patch: truncateText(file.patch ?? '', MAX_PATCH_SNIPPET_LENGTH),
        }));
      }
      case 'grep_pull_request_changes': {
        const query = typeof args.query === 'string' ? args.query.trim() : '';

        if (!query) {
          return {error: 'The "query" argument is required.'};
        }

        const limit = clampNumber(args.limit, 1, MAX_GREP_MATCHES, 5);
        const files = await this.githubService.listPullRequestFiles(
          context.installationId,
          context.repositoryFullName,
          context.pullRequestNumber,
        );
        const normalizedQuery = query.toLowerCase();
        const matches = files
          .filter(file => {
            const haystack = [file.filename, file.previous_filename, file.patch]
              .filter(Boolean)
              .join('\n')
              .toLowerCase();

            return haystack.includes(normalizedQuery);
          })
          .slice(0, limit)
          .map(file => ({
            filename: file.filename,
            status: file.status,
            previous_filename: file.previous_filename ?? null,
            commentable_lines: file.patch
              ? collectAddedLines(file.patch).map(line => ({
                  line: line.lineNumber,
                  content: line.content,
                }))
              : [],
            annotated_patch: file.patch
              ? renderAnnotatedPatch(file.patch, MAX_PATCH_SNIPPET_LENGTH)
              : '(not available)',
            patch: truncateText(file.patch ?? '', MAX_PATCH_SNIPPET_LENGTH),
          }));

        return {
          query,
          matches,
        };
      }
      case 'get_pull_request_file_contents': {
        const path = typeof args.path === 'string' ? args.path.trim() : '';

        if (!path) {
          return {error: 'The "path" argument is required.'};
        }

        const contents = await this.githubService.getPullRequestFileContents(
          context.installationId,
          context.repositoryFullName,
          context.pullRequestNumber,
          path,
        );

        return {
          path,
          content: truncateText(contents, MAX_FILE_CONTENT_LENGTH),
        };
      }
    }
  }

  private normalizePrediction(response: {
    priority?: string;
    reason?: string;
    findings?: Array<{
      path?: string;
      line?: number;
      body?: string;
      line_content?: string;
    }>;
  }): PullRequestMergeRiskPrediction {
    return {
      priority: normalizePriority(response.priority) ?? 'Unknown',
      reason: response.reason?.trim() || 'Missing merge-risk explanation.',
      findings: normalizeFindings(response.findings),
    };
  }

  private fallbackPrediction(
    repositoryFullName: string,
    pullRequestNumber: number,
    error: unknown,
  ): PullRequestMergeRiskPrediction {
    console.warn('Pull request merge risk prediction failed', {
      repositoryFullName,
      pullRequestNumber,
      error,
    });

    return {
      priority: 'Unknown',
      reason: 'AI merge-risk analysis was unavailable.',
      findings: [],
    };
  }
  private async buildInitialEvidenceMessage(context: {
    installationId?: number | null;
    repositoryFullName: string;
    pullRequestNumber: number;
  }): Promise<string> {
    if (!context.installationId) {
      return 'Changed-file evidence is unavailable because GitHub installation context is missing.';
    }

    const overview = (await this.githubService.getPullRequestOverview(
      context.installationId,
      context.repositoryFullName,
      context.pullRequestNumber,
    )) ?? {
      changed_files: 0,
      additions: 0,
      deletions: 0,
      commits: 0,
      draft: false,
      mergeable_state: null,
      head_ref: null,
      base_ref: null,
    };
    const files =
      (await this.githubService.listPullRequestFiles(
        context.installationId,
        context.repositoryFullName,
        context.pullRequestNumber,
      )) ?? [];
    const summarizedFiles = files
      .slice(0, MAX_INITIAL_FILE_EVIDENCE)
      .map(file =>
        [
          `Path: ${file.filename}`,
          `Status: ${file.status}`,
          `Changes: +${file.additions} / -${file.deletions} / total ${file.changes}`,
          file.patch
            ? `Commentable new lines: ${formatCommentableLines(
                collectAddedLines(file.patch).map(line => line.lineNumber),
              )}`
            : null,
          file.previous_filename
            ? `Previous path: ${file.previous_filename}`
            : null,
          file.patch
            ? `Annotated patch:\n${renderAnnotatedPatch(
                file.patch,
                MAX_PATCH_SNIPPET_LENGTH,
              )}`
            : null,
          file.patch
            ? `Patch snippet:\n${truncateText(file.patch, MAX_PATCH_SNIPPET_LENGTH)}`
            : 'Patch snippet: (not available)',
        ]
          .filter(Boolean)
          .join('\n'),
      );

    console.log('Pull request merge risk preloaded evidence', {
      repositoryFullName: context.repositoryFullName,
      pullRequestNumber: context.pullRequestNumber,
      changedFiles: files.length,
      includedFiles: summarizedFiles.length,
    });

    return [
      'Changed-file evidence:',
      [
        `Overview: changed_files=${overview.changed_files}, additions=${overview.additions}, deletions=${overview.deletions}, commits=${overview.commits}, draft=${overview.draft}, mergeable_state=${overview.mergeable_state ?? 'unknown'}`,
        `Head ref: ${overview.head_ref ?? 'unknown'}`,
        `Base ref: ${overview.base_ref ?? 'unknown'}`,
      ].join('\n'),
      summarizedFiles.length
        ? summarizedFiles.join('\n\n---\n\n')
        : 'No changed files were returned by GitHub.',
    ].join('\n\n');
  }
}

function normalizeFindings(
  findings:
    | Array<{
        path?: string;
        line?: number;
        body?: string;
        line_content?: string;
      }>
    | undefined,
): PullRequestReviewFinding[] {
  if (!Array.isArray(findings)) {
    return [];
  }

  return findings
    .map((finding): PullRequestReviewFinding | null => {
      const path = finding.path?.trim();
      const body = finding.body?.trim();
      const lineContent = finding.line_content?.trim();
      const line =
        typeof finding.line === 'number' ? Math.trunc(finding.line) : NaN;

      if (!path || !body || !Number.isInteger(line) || line < 1) {
        return null;
      }

      return {
        path,
        line,
        body: truncateInlineText(body, MAX_REVIEW_COMMENT_BODY_LENGTH),
        lineContent,
      };
    })
    .filter((finding): finding is PullRequestReviewFinding => finding !== null)
    .slice(0, MAX_REVIEW_FINDINGS);
}

function normalizeToolName(
  value: string | undefined,
): PullRequestToolName | null {
  switch (value?.trim()) {
    case 'get_pull_request_overview':
      return 'get_pull_request_overview';
    case 'list_pull_request_files':
      return 'list_pull_request_files';
    case 'grep_pull_request_changes':
      return 'grep_pull_request_changes';
    case 'get_pull_request_file_contents':
      return 'get_pull_request_file_contents';
    default:
      return null;
  }
}

function normalizePriority(value: string | undefined): IssuePriority | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();

  return (
    ISSUE_PRIORITY_VALUES.find(
      priority =>
        priority.toLowerCase() === normalizedValue ||
        priority.replace('-', '').toLowerCase() ===
          normalizedValue.replace(/\s|-/g, ''),
    ) ?? null
  );
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n...[truncated]`;
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}

function summarizeToolResult(result: unknown): Record<string, unknown> {
  if (Array.isArray(result)) {
    return {
      type: 'array',
      count: result.length,
    };
  }

  if (result && typeof result === 'object') {
    const keys = Object.keys(result);

    return {
      type: 'object',
      keys,
    };
  }

  return {
    type: typeof result,
  };
}

function collectAddedLines(
  patch: string,
): Array<{lineNumber: number; content: string}> {
  const addedLines: Array<{lineNumber: number; content: string}> = [];
  let nextNewLineNumber = 0;

  for (const line of patch.split('\n')) {
    const hunkHeaderMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);

    if (hunkHeaderMatch) {
      nextNewLineNumber = Number(hunkHeaderMatch[1]);
      continue;
    }

    if (!nextNewLineNumber) {
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines.push({
        lineNumber: nextNewLineNumber,
        content: line.slice(1),
      });
      nextNewLineNumber += 1;
      continue;
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      continue;
    }

    if (line.startsWith(' ')) {
      nextNewLineNumber += 1;
    }
  }

  return addedLines;
}

function renderAnnotatedPatch(patch: string, maxLength: number): string {
  const annotatedLines: string[] = [];
  let nextNewLineNumber = 0;

  for (const line of patch.split('\n')) {
    const hunkHeaderMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);

    if (hunkHeaderMatch) {
      nextNewLineNumber = Number(hunkHeaderMatch[1]);
      annotatedLines.push(line);
      continue;
    }

    if (!nextNewLineNumber) {
      annotatedLines.push(line);
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      annotatedLines.push(`NEW ${nextNewLineNumber}: ${line.slice(1)}`);
      nextNewLineNumber += 1;
      continue;
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      annotatedLines.push(`OLD: ${line.slice(1)}`);
      continue;
    }

    if (line.startsWith(' ')) {
      annotatedLines.push(`CTX ${nextNewLineNumber}: ${line.slice(1)}`);
      nextNewLineNumber += 1;
      continue;
    }

    annotatedLines.push(line);
  }

  return truncateText(annotatedLines.join('\n'), maxLength);
}

function formatCommentableLines(lines: number[]): string {
  if (!lines.length) {
    return '(none)';
  }

  const preview = lines.slice(0, 20).join(', ');

  if (lines.length <= 20) {
    return preview;
  }

  return `${preview}, ...`;
}

function truncateInlineText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
