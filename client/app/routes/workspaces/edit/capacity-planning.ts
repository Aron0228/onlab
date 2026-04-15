import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import type CapacityPlanEntryModel from 'client/models/capacity-plan-entry';
import type CapacityPlanModel from 'client/models/capacity-plan';
import type GithubIssueModel from 'client/models/github-issue';
import type GithubRepositoryModel from 'client/models/github-repository';
import type IssueAssignmentModel from 'client/models/issue-assignment';
import type UserModel from 'client/models/user';
import type WorkspaceMemberModel from 'client/models/workspace-member';
import type WorkspaceModel from 'client/models/workspace';
import type { WorkspacesIssuesRouteModel } from 'client/routes/workspaces/edit';

type StoreLike = {
  findRecord(modelName: 'user', id: number): Promise<UserModel>;
  query(
    modelName: 'capacity-plan',
    query: Record<string, unknown>
  ): Promise<ArrayLike<CapacityPlanModel>>;
  query(
    modelName: 'capacity-plan-entry',
    query: Record<string, unknown>
  ): Promise<ArrayLike<CapacityPlanEntryModel>>;
  query(
    modelName: 'issue-assignment',
    query: Record<string, unknown>
  ): Promise<ArrayLike<IssueAssignmentModel>>;
  query(
    modelName: 'workspace-member',
    query: Record<string, unknown>
  ): Promise<ArrayLike<WorkspaceMemberModel>>;
  query(
    modelName: 'github-issue',
    query: Record<string, unknown>
  ): Promise<ArrayLike<GithubIssueModel>>;
};

export type CapacityPlanningTeamMember = {
  id: string;
  user: UserModel;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  workspaceMember?: WorkspaceMemberModel;
};

export type WorkspacesEditCapacityPlanningRouteModel = {
  workspace: WorkspaceModel;
  repositories: GithubRepositoryModel[];
  plans: CapacityPlanModel[];
  entries: CapacityPlanEntryModel[];
  issueAssignments: IssueAssignmentModel[];
  teamMembers: CapacityPlanningTeamMember[];
  issues: GithubIssueModel[];
};

export default class WorkspacesEditCapacityPlanningRoute extends Route {
  @service declare store: StoreLike;

  async model(): Promise<WorkspacesEditCapacityPlanningRouteModel> {
    const workspacesEditModel = this.modelFor(
      'workspaces.edit'
    ) as WorkspacesIssuesRouteModel;
    const workspace = workspacesEditModel.workspace;
    const repositories = workspacesEditModel.repositories;
    const workspaceId = Number(workspace.id);
    const repositoryIds = repositories.map((repository) =>
      Number(repository.id)
    );

    const [plans, owner, members, issues] = await Promise.all([
      this.store.query('capacity-plan', {
        filter: {
          where: {
            workspaceId,
          },
          order: ['start DESC'],
        },
      }),
      this.store.findRecord('user', workspace.ownerId),
      this.store.query('workspace-member', {
        filter: {
          where: {
            workspaceId,
          },
          include: ['user'],
          order: ['id ASC'],
        },
      }),
      repositoryIds.length
        ? this.store.query('github-issue', {
            filter: {
              include: ['aiPrediction'],
              where: {
                repositoryId: { inq: repositoryIds },
                status: 'open',
              },
              order: ['githubIssueNumber ASC'],
            },
          })
        : Promise.resolve([] as ArrayLike<GithubIssueModel>),
    ]);

    const planRecords = Array.from(plans);
    const planIds = planRecords.map((plan) => Number(plan.id));

    const [entries, issueAssignments] = planIds.length
      ? await Promise.all([
          this.store.query('capacity-plan-entry', {
            filter: {
              include: ['user'],
              where: {
                capacityPlanId: { inq: planIds },
              },
              order: ['id ASC'],
            },
          }),
          this.store.query('issue-assignment', {
            filter: {
              include: ['issue', 'user'],
              where: {
                capacityPlanId: { inq: planIds },
              },
              order: ['id ASC'],
            },
          }),
        ])
      : [
          [] as ArrayLike<CapacityPlanEntryModel>,
          [] as ArrayLike<IssueAssignmentModel>,
        ];

    return {
      workspace,
      repositories,
      plans: planRecords,
      entries: Array.from(entries),
      issueAssignments: Array.from(issueAssignments),
      teamMembers: [
        {
          id: `owner-${owner.id}`,
          user: owner,
          role: 'OWNER',
        },
        ...Array.from(members)
          .filter((member) => member.user)
          .map((member) => ({
            id: String(member.id),
            user: member.user!,
            role: member.role ?? 'MEMBER',
            workspaceMember: member,
          })),
      ],
      issues: Array.from(issues),
    };
  }
}
