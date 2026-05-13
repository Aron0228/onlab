import {
  BindingScope,
  Getter,
  inject,
  injectable,
  service,
} from '@loopback/core';
import {repository} from '@loopback/repository';
import {
  AIEstimationConfidence,
  AIPredictionExpertiseRecommendation,
  UserExpertiseAssocWithRelations,
} from '../models';
import {
  ExpertiseRepository,
  UserExpertiseAssocRepository,
} from '../repositories';
import {OllamaService} from './ollama.service';
import type {GithubService} from './github-integration/github.service';

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
  estimatedHours?: number | null;
  estimationConfidence?: AIEstimationConfidence | null;
  expertiseRecommendations?: AIPredictionExpertiseRecommendation[];
};

type PredictionNoteKind = 'priority' | 'risk';

type PredictIssuePriorityInput = {
  title: string;
  description: string | null;
  installationId?: number | null;
  repositoryFullName?: string | null;
  workspaceId?: number | null;
};

type IssuePriorityAiResponse =
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
      estimated_hours?: number | null;
      estimation_confidence?: string | null;
      expertise_recommendations?: unknown;
    }
  | {
      priority?: string;
      reason?: string;
      estimated_hours?: number | null;
      estimation_confidence?: string | null;
      expertise_recommendations?: unknown;
    };

type IssuePriorityToolName =
  | 'get_repository_overview'
  | 'list_repository_directory'
  | 'get_repository_file_contents';

type IssuePriorityMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type IssueExpertiseContext = {
  catalog: Array<{
    id: number;
    name: string;
    description?: string | null;
    recommendedUsers: Array<{
      userId: number;
      username: string;
      fullName?: string | null;
    }>;
  }>;
  byKey: Map<
    string,
    {
      id: number;
      name: string;
      description?: string | null;
      recommendedUsers: Array<{
        userId: number;
        username: string;
        fullName?: string | null;
      }>;
    }
  >;
};

type IssueExpertiseCatalogItem = IssueExpertiseContext['catalog'][number];

const AI_PRIORITY_NOTE_START = '<!-- onlab-ai-priority:start -->';
const AI_PRIORITY_NOTE_END = '<!-- onlab-ai-priority:end -->';
const ISSUE_PROCESSING_EMOJI = '👀';
const MAX_TOOL_CALLS = 8;
const MAX_DIRECTORY_RESULTS = 30;
const MAX_FILE_CONTENT_LENGTH = 6000;
const MAX_INITIAL_DIRECTORY_RESULTS = 20;
const DEFAULT_PREDICTION_CACHE_TTL_MS = 10 * 60 * 1000;

type CachedIssuePriorityPrediction = {
  expiresAt: number;
  prediction: IssuePriorityPrediction;
};

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
REPOSITORY CONTEXT
====================

When repository tools are available, use them to inspect the codebase and infer the repository workframe:
- language and framework
- architecture style
- testing setup
- repository conventions and best practices implied by config files and structure

Use that repository context to estimate engineering effort more realistically.
Examples:
- a LoopBack or Nest backend issue may require controller/service/repository/test changes
- an Ember or React frontend issue may require component, route, and test updates
- typed and heavily structured repos usually imply extra integration and test effort

Do not crawl the entire repository.
Use only the minimum repository inspection needed to ground the estimate.
Prefer overview, root files, framework config, and a few relevant files over broad exploration.

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
  "reason": "<Reason for the priority classification>",
  "estimated_hours": <integer estimate for engineering fix effort>,
  "estimation_confidence": "<low|medium|high>",
  "expertise_recommendations": [
    {
      "expertise_name": "<one exact name from the workspace expertise catalog>",
      "reason": "<why this expertise is relevant>"
    }
  ]
}

Estimate only the engineering implementation effort to fix the issue.
Use rough whole-hour estimates only.
Do NOT use decimals.
Good examples: 1, 2, 4, 8, 16, 24, 40.
If the issue is too vague to estimate safely, use null or omit the field and set estimation_confidence to "low".

When a workspace expertise catalog is provided, recommend only exact expertise names from that catalog.
Return an empty expertise_recommendations array if no catalog expertise is clearly relevant.

When tools are available, you may inspect the repository before answering.
Use tools only when they materially improve the estimate.

When you want to use a tool, return ONLY JSON like:
{
  "type": "tool_call",
  "tool": "<tool name>",
  "arguments": { ... },
  "reason": "<why you need it>"
}

Available tools:
- get_repository_overview: no arguments
- list_repository_directory: optional arguments { "path"?: string, "limit"?: number }
- get_repository_file_contents: required arguments { "path": string }

Don't return anything else!`;

@injectable({scope: BindingScope.SINGLETON})
export class IssuePriorityService {
  private readonly predictionCacheTtlMs = readEnvNumber(
    'ISSUE_PRIORITY_CACHE_TTL_MS',
    DEFAULT_PREDICTION_CACHE_TTL_MS,
    0,
  );
  private readonly predictionCache = new Map<
    string,
    CachedIssuePriorityPrediction
  >();
  private readonly inFlightPredictions = new Map<
    string,
    Promise<IssuePriorityPrediction>
  >();

  constructor(
    @service(OllamaService) private ollamaService: OllamaService,
    @inject.getter('services.GithubService', {optional: true})
    private githubServiceGetter: Getter<GithubService | undefined>,
    @repository(ExpertiseRepository)
    private expertiseRepository: ExpertiseRepository,
    @repository(UserExpertiseAssocRepository)
    private userExpertiseAssocRepository: UserExpertiseAssocRepository,
  ) {}

  public async predictIssuePriority({
    title,
    description,
    installationId,
    repositoryFullName,
    workspaceId,
  }: PredictIssuePriorityInput): Promise<IssuePriorityPrediction> {
    const cleanDescription = this.sanitizeIssueDescription(description);
    const cacheKey = this.buildPredictionCacheKey({
      title,
      description: cleanDescription,
      repositoryFullName,
      workspaceId,
    });
    const cachedPrediction = this.getCachedPrediction(cacheKey);

    if (cachedPrediction) {
      return cachedPrediction;
    }

    const inFlightPrediction = this.inFlightPredictions.get(cacheKey);

    if (inFlightPrediction) {
      return inFlightPrediction;
    }

    const predictionPromise = this.predictIssuePriorityUncached({
      title,
      cleanDescription,
      installationId,
      repositoryFullName,
      workspaceId,
    })
      .then(prediction => {
        this.setCachedPrediction(cacheKey, prediction);
        return prediction;
      })
      .finally(() => {
        this.inFlightPredictions.delete(cacheKey);
      });

    this.inFlightPredictions.set(cacheKey, predictionPromise);
    return predictionPromise;
  }

  private async predictIssuePriorityUncached({
    title,
    cleanDescription,
    installationId,
    repositoryFullName,
    workspaceId,
  }: {
    title: string;
    cleanDescription: string;
    installationId?: number | null;
    repositoryFullName?: string | null;
    workspaceId?: number | null;
  }): Promise<IssuePriorityPrediction> {
    const expertiseContext = await this.buildExpertiseContext(workspaceId);
    const messages: IssuePriorityMessage[] = [
      {
        role: 'system',
        content: PRIORITY_PROMPT,
      },
      {
        role: 'user',
        content: [
          repositoryFullName ? `Repository: ${repositoryFullName}` : null,
          `Issue title: ${title}`,
          `Issue description:\n${cleanDescription || '(empty)'}`,
          this.buildExpertisePromptContext(expertiseContext),
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ];

    try {
      messages.push({
        role: 'user',
        content: await this.buildInitialEvidenceMessage({
          installationId,
          repositoryFullName,
        }),
      });

      for (let iteration = 1; iteration <= MAX_TOOL_CALLS + 1; iteration += 1) {
        const response =
          await this.ollamaService.chatJson<IssuePriorityAiResponse>({
            messages,
          });

        if (isFinalResponse(response)) {
          return this.normalizePrediction(response, expertiseContext);
        }

        if (!isToolCallResponse(response)) {
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
            title,
            new Error('AI exceeded the maximum number of tool calls'),
          );
        }

        const toolName = normalizeToolName(response.tool);

        if (!toolName) {
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

        const toolResult = await this.executeTool(
          toolName,
          response.arguments ?? {},
          {
            installationId,
            repositoryFullName,
          },
        );

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
      return this.fallbackPrediction(title, error);
    }

    return this.fallbackPrediction(
      title,
      new Error('AI issue prioritization ended without a final response'),
    );
  }

  private buildPredictionCacheKey({
    title,
    description,
    repositoryFullName,
    workspaceId,
  }: {
    title: string;
    description: string;
    repositoryFullName?: string | null;
    workspaceId?: number | null;
  }): string {
    return JSON.stringify({
      repositoryFullName: repositoryFullName ?? null,
      workspaceId: workspaceId ?? null,
      title: title.trim(),
      description: description.trim(),
    });
  }

  private getCachedPrediction(
    cacheKey: string,
  ): IssuePriorityPrediction | null {
    if (this.predictionCacheTtlMs <= 0) {
      return null;
    }

    const cached = this.predictionCache.get(cacheKey);

    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.predictionCache.delete(cacheKey);
      return null;
    }

    return cached.prediction;
  }

  private setCachedPrediction(
    cacheKey: string,
    prediction: IssuePriorityPrediction,
  ): void {
    if (this.predictionCacheTtlMs <= 0) {
      return;
    }

    this.predictionCache.set(cacheKey, {
      expiresAt: Date.now() + this.predictionCacheTtlMs,
      prediction,
    });
  }

  public sanitizeIssueDescription(
    description: string | null | undefined,
  ): string {
    const descriptionWithoutNote = this.stripPredictionNote(description);

    return descriptionWithoutNote.replace(/^👀\s*/u, '').trimStart();
  }

  public normalizePredictionInput(
    prediction: Partial<IssuePriorityPrediction> | null | undefined,
  ): IssuePriorityPrediction | null {
    if (!prediction) {
      return null;
    }

    const priority = normalizeIssuePriority(prediction.priority);
    const reason = prediction.reason?.trim();

    if (!priority || !reason) {
      return null;
    }

    return {
      priority,
      reason,
      estimatedHours: normalizeEstimatedHours(prediction.estimatedHours),
      estimationConfidence: normalizeEstimationConfidence(
        prediction.estimationConfidence,
      ),
      expertiseRecommendations: normalizeExistingExpertiseRecommendations(
        prediction.expertiseRecommendations,
      ),
    };
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
      prediction.estimatedHours
        ? `> Estimated effort: ${prediction.estimatedHours}h (${prediction.estimationConfidence ?? 'unknown'} confidence)`
        : null,
      ...formatExpertiseRecommendationNoteLines(
        prediction.expertiseRecommendations,
      ),
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

  private normalizePrediction(
    response: {
      priority?: string;
      reason?: string;
      estimated_hours?: number | null;
      estimation_confidence?: string | null;
      expertise_recommendations?: unknown;
    },
    expertiseContext?: IssueExpertiseContext | null,
  ): IssuePriorityPrediction {
    const priority = normalizeIssuePriority(response.priority);

    return {
      priority: priority ?? 'Unknown',
      reason: response.reason?.trim() || 'Missing classification reason.',
      estimatedHours: normalizeEstimatedHours(response.estimated_hours),
      estimationConfidence: normalizeEstimationConfidence(
        response.estimation_confidence,
      ),
      expertiseRecommendations: normalizeAiExpertiseRecommendations(
        response.expertise_recommendations,
        expertiseContext,
      ),
    };
  }

  private fallbackPrediction(
    title: string,
    error: unknown,
  ): IssuePriorityPrediction {
    console.warn('Issue priority prediction failed, falling back to Unknown', {
      title,
      error,
    });

    return {
      priority: 'Unknown',
      reason: 'AI prioritization unavailable.',
      estimatedHours: null,
      estimationConfidence: 'low',
    };
  }

  private async buildExpertiseContext(
    workspaceId?: number | null,
  ): Promise<IssueExpertiseContext | null> {
    if (!workspaceId) {
      return null;
    }

    const expertises = await this.expertiseRepository.find({
      where: {workspaceId},
      order: ['name ASC'],
    });

    const expertiseIds = expertises
      .map(expertise => expertise.id)
      .filter((id): id is number => typeof id === 'number');

    if (!expertiseIds.length) {
      return null;
    }

    const expertiseUsers = await this.userExpertiseAssocRepository.find({
      where: {expertiseId: {inq: expertiseIds}},
      include: ['user'],
    });
    const usersByExpertiseId = groupUsersByExpertiseId(expertiseUsers);
    const catalog = expertises.map(expertise => ({
      id: expertise.id,
      name: expertise.name,
      description: expertise.description ?? null,
      recommendedUsers: usersByExpertiseId.get(expertise.id) ?? [],
    }));

    return {
      catalog,
      byKey: new Map(
        catalog.map(item => [normalizeExpertiseKey(item.name), item]),
      ),
    };
  }

  private buildExpertisePromptContext(
    expertiseContext: IssueExpertiseContext | null,
  ): string | null {
    if (!expertiseContext?.catalog.length) {
      return null;
    }

    return [
      'Workspace expertise catalog:',
      ...expertiseContext.catalog.map(item =>
        [
          `- ${item.name}`,
          item.description?.trim()
            ? `description=${item.description.trim()}`
            : null,
          item.recommendedUsers.length
            ? `people=${item.recommendedUsers
                .map(user => user.fullName || user.username)
                .join(', ')}`
            : 'people=none',
        ]
          .filter(Boolean)
          .join(' | '),
      ),
      'Use exact expertise names from this catalog in expertise_recommendations.',
    ].join('\n');
  }

  private async buildInitialEvidenceMessage(context: {
    installationId?: number | null;
    repositoryFullName?: string | null;
  }): Promise<string> {
    if (!context.installationId || !context.repositoryFullName) {
      return 'Repository evidence is unavailable, so estimate using only the issue text.';
    }

    const githubService = await this.githubServiceGetter();

    if (!githubService) {
      return 'Repository evidence is unavailable because GitHub service is not bound; estimate using only the issue text.';
    }

    let overview: Awaited<ReturnType<GithubService['getRepositoryOverview']>>;
    let rootEntries: Awaited<
      ReturnType<GithubService['listRepositoryDirectory']>
    >;

    try {
      [overview, rootEntries] = await Promise.all([
        githubService.getRepositoryOverview(
          context.installationId,
          context.repositoryFullName,
        ),
        githubService.listRepositoryDirectory(
          context.installationId,
          context.repositoryFullName,
          '',
        ),
      ]);
    } catch (error) {
      return `Repository evidence is unavailable (${summarizeToolExecutionError(error)}), so estimate using only the issue text.`;
    }

    const summarizedEntries = rootEntries
      .slice(0, MAX_INITIAL_DIRECTORY_RESULTS)
      .map(entry =>
        [
          `- path=${entry.path}`,
          `type=${entry.type}`,
          typeof entry.size === 'number' ? `size=${entry.size}` : null,
        ]
          .filter(Boolean)
          .join(' | '),
      );

    return [
      'Repository evidence:',
      [
        `default_branch=${overview.default_branch ?? 'unknown'}`,
        `language=${overview.language ?? 'unknown'}`,
        `topics=${overview.topics.length ? overview.topics.join(', ') : 'none'}`,
        `description=${overview.description?.trim() || '(empty)'}`,
      ].join('\n'),
      'Root directory entries:',
      summarizedEntries.length
        ? summarizedEntries.join('\n')
        : '(no root entries returned)',
    ].join('\n\n');
  }

  private async executeTool(
    toolName: IssuePriorityToolName,
    args: Record<string, unknown>,
    context: {
      installationId?: number | null;
      repositoryFullName?: string | null;
    },
  ): Promise<unknown> {
    if (!context.installationId || !context.repositoryFullName) {
      return {
        error:
          'GitHub installation context is unavailable, so repository tools cannot be executed for this issue.',
      };
    }

    const githubService = await this.githubServiceGetter();

    if (!githubService) {
      return {
        error:
          'GitHub service is unavailable, so repository tools cannot be executed for this issue.',
      };
    }

    switch (toolName) {
      case 'get_repository_overview':
        try {
          return await githubService.getRepositoryOverview(
            context.installationId,
            context.repositoryFullName,
          );
        } catch (error) {
          return {error: summarizeToolExecutionError(error)};
        }
      case 'list_repository_directory': {
        const path = typeof args.path === 'string' ? args.path.trim() : '';
        const limit = clampNumber(args.limit, 1, MAX_DIRECTORY_RESULTS, 20);

        try {
          const entries = await githubService.listRepositoryDirectory(
            context.installationId,
            context.repositoryFullName,
            path,
          );

          console.log('Issue priority AI listed repository directory', {
            repositoryFullName: context.repositoryFullName,
            path: path || '.',
            returnedEntries: entries.slice(0, limit).map(entry => entry.path),
          });

          return {
            path: path || '.',
            entries: entries.slice(0, limit),
          };
        } catch (error) {
          return {
            path: path || '.',
            error: summarizeToolExecutionError(error),
          };
        }
      }
      case 'get_repository_file_contents': {
        const path = typeof args.path === 'string' ? args.path.trim() : '';

        if (!path) {
          return {error: 'The "path" argument is required.'};
        }

        try {
          const contents = await githubService.getRepositoryFileContents(
            context.installationId,
            context.repositoryFullName,
            path,
          );

          console.log('Issue priority AI read repository file', {
            repositoryFullName: context.repositoryFullName,
            path,
          });

          return {
            path,
            content: truncateText(contents, MAX_FILE_CONTENT_LENGTH),
          };
        } catch (error) {
          return {
            path,
            error: summarizeToolExecutionError(error),
          };
        }
      }
    }
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

function normalizeToolName(
  value: string | undefined,
): IssuePriorityToolName | null {
  switch (value?.trim()) {
    case 'get_repository_overview':
      return 'get_repository_overview';
    case 'list_repository_directory':
      return 'list_repository_directory';
    case 'get_repository_file_contents':
      return 'get_repository_file_contents';
    default:
      return null;
  }
}

function isToolCallResponse(
  value: IssuePriorityAiResponse,
): value is Extract<IssuePriorityAiResponse, {type: 'tool_call'}> {
  return 'type' in value && value.type === 'tool_call';
}

function isFinalResponse(
  value: IssuePriorityAiResponse,
): value is Exclude<
  IssuePriorityAiResponse,
  Extract<IssuePriorityAiResponse, {type: 'tool_call'}>
> {
  return (
    ('type' in value && value.type === 'final') ||
    (!('type' in value) &&
      (typeof value.priority === 'string' ||
        typeof value.reason === 'string' ||
        typeof value.estimated_hours === 'number' ||
        value.estimated_hours === null))
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeEstimatedHours(
  value: number | null | undefined,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const normalizedValue = Math.round(value);

  if (normalizedValue <= 0 || normalizedValue > 200) {
    return null;
  }

  return normalizedValue;
}

function normalizeEstimationConfidence(
  value: string | null | undefined,
): AIEstimationConfidence | null {
  switch (value?.trim().toLowerCase()) {
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
    default:
      return null;
  }
}

function normalizeExistingExpertiseRecommendations(
  value: IssuePriorityPrediction['expertiseRecommendations'],
): AIPredictionExpertiseRecommendation[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const recommendations = value
    .map(recommendation => {
      const expertiseId = recommendation.expertiseId;
      const name = recommendation.name?.trim();

      if (typeof expertiseId !== 'number' || !Number.isFinite(expertiseId)) {
        return null;
      }

      if (!name) {
        return null;
      }

      return {
        expertiseId,
        name,
        reason:
          recommendation.reason?.trim() ||
          'Relevant workspace expertise for this issue.',
        recommendedUsers: normalizeRecommendedUsers(
          recommendation.recommendedUsers,
        ),
      };
    })
    .filter(
      (recommendation): recommendation is AIPredictionExpertiseRecommendation =>
        recommendation !== null,
    );

  return recommendations.length ? recommendations : undefined;
}

function normalizeAiExpertiseRecommendations(
  value: unknown,
  expertiseContext?: IssueExpertiseContext | null,
): AIPredictionExpertiseRecommendation[] | undefined {
  if (!Array.isArray(value) || !expertiseContext) {
    return undefined;
  }

  const seenExpertiseIds = new Set<number>();
  const recommendations: AIPredictionExpertiseRecommendation[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const rawName = item.expertise_name ?? item.name;

    if (typeof rawName !== 'string') {
      continue;
    }

    const expertise = expertiseContext.byKey.get(
      normalizeExpertiseKey(rawName),
    );

    if (!expertise || seenExpertiseIds.has(expertise.id)) {
      continue;
    }

    seenExpertiseIds.add(expertise.id);
    recommendations.push({
      expertiseId: expertise.id,
      name: expertise.name,
      reason:
        typeof item.reason === 'string' && item.reason.trim()
          ? item.reason.trim()
          : 'Relevant workspace expertise for this issue.',
      recommendedUsers: expertise.recommendedUsers,
    });
  }

  return recommendations.length ? recommendations : undefined;
}

function formatExpertiseRecommendationNoteLines(
  recommendations: AIPredictionExpertiseRecommendation[] | undefined,
): string[] {
  if (!recommendations?.length) {
    return [];
  }

  const expertiseSummary = recommendations
    .map(recommendation => `${recommendation.name} (${recommendation.reason})`)
    .join('; ');
  const recommendedUsers = [
    ...new Set(
      recommendations.flatMap(recommendation =>
        recommendation.recommendedUsers.map(
          user => user.fullName || user.username,
        ),
      ),
    ),
  ];

  return [
    `> Relevant expertise: ${expertiseSummary}`,
    recommendedUsers.length
      ? `> Recommended people: ${recommendedUsers.join(', ')}`
      : null,
  ].filter((line): line is string => Boolean(line));
}

function groupUsersByExpertiseId(
  associations: UserExpertiseAssocWithRelations[],
): Map<number, IssueExpertiseCatalogItem['recommendedUsers']> {
  const usersByExpertiseId = new Map<
    number,
    IssueExpertiseCatalogItem['recommendedUsers']
  >();

  for (const association of associations) {
    const user = association.user;

    if (!user?.id || !user.username?.trim()) {
      continue;
    }

    const users = usersByExpertiseId.get(association.expertiseId) ?? [];
    users.push({
      userId: user.id,
      username: user.username,
      fullName: user.fullName ?? null,
    });
    usersByExpertiseId.set(association.expertiseId, users);
  }

  return usersByExpertiseId;
}

function normalizeRecommendedUsers(
  value: AIPredictionExpertiseRecommendation['recommendedUsers'],
): AIPredictionExpertiseRecommendation['recommendedUsers'] {
  if (!Array.isArray(value)) {
    return [];
  }

  const users: AIPredictionExpertiseRecommendation['recommendedUsers'] = [];

  for (const user of value) {
    if (typeof user.userId !== 'number' || !Number.isFinite(user.userId)) {
      continue;
    }

    const username = user.username?.trim();

    if (!username) {
      continue;
    }

    users.push({
      userId: user.userId,
      username,
      fullName: user.fullName?.trim() || null,
    });
  }

  return users;
}

function normalizeExpertiseKey(value: string): string {
  return value.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n...[truncated]`;
}

function summarizeToolExecutionError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return 'Unknown tool execution error.';
}

function readEnvNumber(name: string, fallback: number, min: number): number {
  const value = Number(process.env[name]);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.floor(value));
}
