import {BindingScope, injectable, service} from '@loopback/core';
import {OllamaService} from './ollama.service';

export const ISSUE_PRIORITY_VALUES = [
  'Unknown',
  'Low',
  'Medium',
  'High',
  'Very-High',
] as const;

export type IssuePriority = (typeof ISSUE_PRIORITY_VALUES)[number];

export type IssuePriorityPrediction = {
  priority: IssuePriority;
  reason: string;
};

type PredictionNoteKind = 'priority' | 'risk';

type PredictIssuePriorityInput = {
  title: string;
  description: string | null;
};

const AI_PRIORITY_NOTE_START = '<!-- onlab-ai-priority:start -->';
const AI_PRIORITY_NOTE_END = '<!-- onlab-ai-priority:end -->';
const ISSUE_PROCESSING_EMOJI = '👀';

const PRIORITY_PROMPT = `You are a senior software reliability engineer.

Your task is to classify software issues by priority.

You must strictly follow the decision tree below.
Do NOT infer missing information.
Use ONLY explicitly stated facts.

====================
PRIORITY DEFINITIONS
====================

Unknown
- The description does NOT clearly state:
  • which module is affected, OR
  • what functionality is broken, OR
  • the impact severity
- If any required detail is missing → return Unknown.

Low
- Cosmetic issue
- UI misalignment
- Minor inconvenience
- No functional impact

Medium
- Exactly one clearly identified feature is broken
- The module remains usable
- The primary purpose of the module still works

High
- An entire module is unusable
- The primary purpose of the module is completely blocked
- Server errors (e.g., HTTP 500) affecting a module
- No explicit security breach is mentioned

Very-High
- Confirmed security vulnerability
- Unauthorized access
- Data exposure
- Authentication bypass
- Confirmed data breach
- Complete system-wide outage

IMPORTANT:
Authentication failure counts as Very-High ONLY if it indicates
a security or identity validation problem.
Server errors (e.g., login page returns 500) are NOT security issues.

====================
STRICT DECISION ORDER
====================

1. If required information is missing → Unknown.
2. If confirmed security or data exposure → Very-High.
3. If complete system-wide outage → Very-High.
4. If entire module unusable → High.
5. If exactly one feature broken but module works → Medium.
6. If cosmetic → Low.

====================
OUTPUT FORMAT
====================

Return ONLY valid JSON in this exact format:

{
  "priority": "<Unknown|Low|Medium|High|Very-High>",
  "reason": "<Reason for the priority classification>"
}

Don't return anything else!`;

@injectable({scope: BindingScope.SINGLETON})
export class IssuePriorityService {
  constructor(@service(OllamaService) private ollamaService: OllamaService) {}

  public async predictIssuePriority({
    title,
    description,
  }: PredictIssuePriorityInput): Promise<IssuePriorityPrediction> {
    const cleanDescription = this.sanitizeIssueDescription(description);

    try {
      const response = await this.ollamaService.chatJson<{
        priority?: string;
        reason?: string;
      }>({
        messages: [
          {
            role: 'system',
            content: PRIORITY_PROMPT,
          },
          {
            role: 'user',
            content: `Issue title: ${title}\nIssue description:\n${cleanDescription || '(empty)'}`,
          },
        ],
      });

      return this.normalizePrediction(response);
    } catch (error) {
      console.warn(
        'Issue priority prediction failed, falling back to Unknown',
        {
          title,
          error,
        },
      );

      return {
        priority: 'Unknown',
        reason: 'AI prioritization unavailable.',
      };
    }
  }

  public sanitizeIssueDescription(
    description: string | null | undefined,
  ): string {
    const descriptionWithoutNote = this.stripPredictionNote(description);

    return descriptionWithoutNote.replace(/^👀\s*/u, '').trimStart();
  }

  public stripPredictionNote(description: string | null | undefined): string {
    if (!description) {
      return '';
    }

    const notePattern = new RegExp(
      `\\s*${escapeRegExp(AI_PRIORITY_NOTE_START)}[\\s\\S]*?${escapeRegExp(AI_PRIORITY_NOTE_END)}\\s*$`,
    );

    return description.replace(notePattern, '').trimEnd();
  }

  public upsertPredictionNote(
    description: string | null | undefined,
    prediction: IssuePriorityPrediction,
    options: {
      kind?: PredictionNoteKind;
    } = {},
  ): string {
    const cleanDescription = this.sanitizeIssueDescription(description);
    const kind = options.kind ?? 'priority';
    const predictionLabel =
      kind === 'risk' ? 'AI merge risk prediction' : 'AI priority prediction';
    const noteBlock = [
      AI_PRIORITY_NOTE_START,
      '> [!NOTE]',
      `> ${predictionLabel}: ${prediction.priority}`,
      `> Reason: ${prediction.reason}`,
      '> Written by `DevTeams`',
      AI_PRIORITY_NOTE_END,
    ].join('\n');

    return cleanDescription ? `${cleanDescription}\n\n${noteBlock}` : noteBlock;
  }

  public prependProcessingEmoji(
    description: string | null | undefined,
  ): string {
    const cleanDescription = this.sanitizeIssueDescription(description);

    return cleanDescription
      ? `${ISSUE_PROCESSING_EMOJI} ${cleanDescription}`
      : ISSUE_PROCESSING_EMOJI;
  }

  public getPriorityLabelName(priority: IssuePriority): string {
    return `Priority: ${priority}`;
  }

  public getRiskLabelName(priority: IssuePriority): string {
    return `Risk: ${priority}`;
  }

  private normalizePrediction(response: {
    priority?: string;
    reason?: string;
  }): IssuePriorityPrediction {
    const priority = normalizeIssuePriority(response.priority);

    return {
      priority: priority ?? 'Unknown',
      reason: response.reason?.trim() || 'Missing classification reason.',
    };
  }
}

function normalizeIssuePriority(
  priority: string | undefined,
): IssuePriority | null {
  if (!priority) {
    return null;
  }

  const normalizedPriority = priority.trim().toLowerCase();

  switch (normalizedPriority) {
    case 'unknown':
      return 'Unknown';
    case 'low':
      return 'Low';
    case 'medium':
      return 'Medium';
    case 'high':
      return 'High';
    case 'very-high':
    case 'very high':
    case 'veryhigh':
      return 'Very-High';
    default:
      return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
