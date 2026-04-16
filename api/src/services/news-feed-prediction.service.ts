import {BindingScope, injectable, service} from '@loopback/core';
import {repository} from '@loopback/repository';
import {
  Expertise,
  NewsFeedSourceType,
  UserExpertiseAssocWithRelations,
  WorkspaceMemberWithRelations,
} from '../models';
import {
  AIPredictionRepository,
  ExpertiseRepository,
  NewsFeedEntryExpertiseAssocRepository,
  NewsFeedEntryRepository,
  UserExpertiseAssocRepository,
  WorkspaceMemberRepository,
} from '../repositories';
import type {PredictNewsFeedEntryJobData} from './queue.service';
import {OllamaService} from './ollama.service';

type NewsFeedPredictionResponse = {
  matchedExpertises?: string[];
  reason?: string;
};

const NEWS_FEED_PROMPT = `You are assisting a software engineering workspace.

Your task is to decide which workspace expertises would care about a new activity.

Rules:
- Use ONLY the provided expertise catalog.
- Match zero or more expertise names exactly from the catalog.
- Prefer high-signal matches; do not select broad matches without evidence.
- Return one short general reason that explains why the activity matters.
- If nothing clearly matches, return an empty matchedExpertises array.

Return ONLY valid JSON in this exact shape:
{
  "matchedExpertises": ["<expertise name>", "<expertise name>"],
  "reason": "<short reason>"
}`;

@injectable({scope: BindingScope.SINGLETON})
export class NewsFeedPredictionService {
  constructor(
    @service(OllamaService)
    private ollamaService: OllamaService,
    @repository(ExpertiseRepository)
    private expertiseRepository: ExpertiseRepository,
    @repository(WorkspaceMemberRepository)
    private workspaceMemberRepository: WorkspaceMemberRepository,
    @repository(UserExpertiseAssocRepository)
    private userExpertiseAssocRepository: UserExpertiseAssocRepository,
    @repository(AIPredictionRepository)
    private aiPredictionRepository: AIPredictionRepository,
    @repository(NewsFeedEntryRepository)
    private newsFeedEntryRepository: NewsFeedEntryRepository,
    @repository(NewsFeedEntryExpertiseAssocRepository)
    private newsFeedEntryExpertiseAssocRepository: NewsFeedEntryExpertiseAssocRepository,
  ) {}

  public async processPredictionJob(
    data: PredictNewsFeedEntryJobData,
  ): Promise<void> {
    const expertises = await this.expertiseRepository.find({
      where: {workspaceId: data.workspaceId},
    });
    const {matchedExpertiseIds, reason} = await this.predictRelevantExpertises(
      data,
      expertises,
    );

    const existingEntry = await this.newsFeedEntryRepository.findOne({
      where: {
        workspaceId: data.workspaceId,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
      },
    });

    const write = {
      workspaceId: data.workspaceId,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      eventAction: data.eventAction,
      title: data.snapshot.title,
      summary: data.snapshot.summary,
      aiReason: reason,
      sourcePriority: await this.getSourcePriority(data),
      sourceDisplayNumber: data.snapshot.sourceDisplayNumber ?? null,
      repositoryName: data.snapshot.repositoryName ?? null,
      happenedAt: data.happenedAt,
    };

    const entry = existingEntry
      ? await this.updateExistingEntry(existingEntry.id, write)
      : await this.newsFeedEntryRepository.create(write);

    await this.newsFeedEntryExpertiseAssocRepository.deleteAll({
      newsFeedEntryId: entry.id,
    });

    if (matchedExpertiseIds.length) {
      await this.newsFeedEntryExpertiseAssocRepository.createAll(
        matchedExpertiseIds.map(expertiseId => ({
          newsFeedEntryId: entry.id,
          expertiseId,
        })),
      );
    }
  }

  private async updateExistingEntry(
    entryId: number,
    write: {
      workspaceId: number;
      sourceType: NewsFeedSourceType;
      sourceId: number;
      eventAction: 'created' | 'updated';
      title: string;
      summary: string;
      aiReason?: string;
      sourcePriority?: string | null;
      sourceDisplayNumber?: string | null;
      repositoryName?: string | null;
      happenedAt: string;
    },
  ) {
    await this.newsFeedEntryRepository.updateById(entryId, write);
    return this.newsFeedEntryRepository.findById(entryId);
  }

  private async predictRelevantExpertises(
    data: PredictNewsFeedEntryJobData,
    expertises: Expertise[],
  ): Promise<{matchedExpertiseIds: number[]; reason?: string}> {
    if (!expertises.length) {
      return {matchedExpertiseIds: [], reason: undefined};
    }

    const normalizedExpertises = new Map(
      expertises.map(expertise => [normalizeName(expertise.name), expertise]),
    );

    try {
      const response =
        await this.ollamaService.chatJson<NewsFeedPredictionResponse>({
          messages: [
            {
              role: 'system',
              content: NEWS_FEED_PROMPT,
            },
            {
              role: 'user',
              content: [
                `Source type: ${data.sourceType}`,
                `Event action: ${data.eventAction}`,
                `Event title: ${data.snapshot.title}`,
                `Event summary: ${data.snapshot.summary}`,
                `Repository: ${data.snapshot.repositoryName ?? '(none)'}`,
                `Display number: ${data.snapshot.sourceDisplayNumber ?? '(none)'}`,
                `Expertise catalog: ${expertises.map(expertise => expertise.name).join(', ')}`,
                `Workspace role context:\n${await this.buildWorkspaceRoleContext(data.workspaceId)}`,
              ].join('\n'),
            },
          ],
        });

      const matchedExpertiseIds = Array.from(
        new Set(
          (response.matchedExpertises ?? [])
            .map(expertiseName =>
              normalizedExpertises.get(normalizeName(expertiseName)),
            )
            .filter((expertise): expertise is Expertise => Boolean(expertise))
            .map(expertise => expertise.id),
        ),
      );

      return {
        matchedExpertiseIds,
        reason: response.reason?.trim() || undefined,
      };
    } catch (error) {
      console.warn(
        'News feed prediction failed, creating entry without matches',
        {
          sourceType: data.sourceType,
          sourceId: data.sourceId,
          error,
        },
      );

      return {
        matchedExpertiseIds: [],
        reason: undefined,
      };
    }
  }

  private async buildWorkspaceRoleContext(
    workspaceId: number,
  ): Promise<string> {
    const workspaceMembers = await this.workspaceMemberRepository.find({
      where: {workspaceId},
      include: ['user'],
    });
    const userIds = workspaceMembers
      .map(member => member.userId)
      .filter((userId): userId is number => typeof userId === 'number');

    const expertiseAssocs = userIds.length
      ? await this.userExpertiseAssocRepository.find({
          where: {userId: {inq: userIds}},
          include: ['expertise'],
        })
      : [];

    return workspaceMembers
      .map(member =>
        formatWorkspaceMemberContext(member, expertiseAssocs, workspaceId),
      )
      .join('\n');
  }

  private async getSourcePriority(
    data: PredictNewsFeedEntryJobData,
  ): Promise<string | null> {
    const predictionType = getPredictionTypeForSource(data.sourceType);

    if (!predictionType) {
      return null;
    }

    const predictionSourceType =
      data.sourceType === 'github-issue'
        ? 'github-issue'
        : 'github-pull-request';

    const prediction = await this.aiPredictionRepository.findOne({
      where: {
        sourceType: predictionSourceType,
        sourceId: data.sourceId,
        predictionType,
      },
    });

    return prediction?.priority ?? null;
  }
}

function formatWorkspaceMemberContext(
  member: WorkspaceMemberWithRelations,
  expertiseAssocs: UserExpertiseAssocWithRelations[],
  workspaceId: number,
): string {
  const expertiseNames = expertiseAssocs
    .filter(
      assoc =>
        assoc.userId === member.userId &&
        assoc.expertise?.workspaceId === workspaceId,
    )
    .map(assoc => assoc.expertise?.name)
    .filter((name): name is string => Boolean(name));

  return `${member.user?.fullName ?? 'Unknown user'} (${member.role ?? 'MEMBER'}) expertises: ${expertiseNames.join(', ') || 'none'}`;
}

function getPredictionTypeForSource(
  sourceType: NewsFeedSourceType,
): 'issue-priority' | 'pull-request-merge-risk' | null {
  switch (sourceType) {
    case 'github-issue':
      return 'issue-priority';
    case 'github-pull-request':
      return 'pull-request-merge-risk';
    default:
      return null;
  }
}

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}
