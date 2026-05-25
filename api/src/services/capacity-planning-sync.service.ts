import {BindingScope, injectable, service} from '@loopback/core';
import {repository} from '@loopback/repository';
import {CapacityPlan, GithubIssue, IssueAssignment} from '../models';
import {
  CapacityPlanRepository,
  GithubIssueRepository,
  GithubRepositoryRepository,
  IssueAssignmentRepository,
  UserRepository,
  WorkspaceRepository,
} from '../repositories';
import {GithubService} from './github-integration/github.service';
import {AuditEventService} from './audit-event.service';

type GithubAssigneeIdentity = {
  id?: number;
  login?: string;
};

type GithubIssueAssigneeSyncInput = {
  action: 'assigned' | 'unassigned';
  repositoryId: number;
  githubIssueId: number;
  githubIssueNumber: number;
  assignee?: GithubAssigneeIdentity | null;
};

@injectable({scope: BindingScope.SINGLETON})
export class CapacityPlanningSyncService {
  constructor(
    @repository(CapacityPlanRepository)
    private capacityPlanRepository: CapacityPlanRepository,
    @repository(GithubIssueRepository)
    private githubIssueRepository: GithubIssueRepository,
    @repository(GithubRepositoryRepository)
    private githubRepositoryRepository: GithubRepositoryRepository,
    @repository(IssueAssignmentRepository)
    private issueAssignmentRepository: IssueAssignmentRepository,
    @repository(UserRepository)
    private userRepository: UserRepository,
    @repository(WorkspaceRepository)
    private workspaceRepository: WorkspaceRepository,
    @service(GithubService)
    private githubService: GithubService,
    @service(AuditEventService)
    private auditEventService: AuditEventService,
  ) {}

  async syncIssueAssignment(assignment: IssueAssignment): Promise<void> {
    const [plan, issue, user] = await Promise.all([
      this.capacityPlanRepository.findById(assignment.capacityPlanId),
      this.githubIssueRepository.findById(assignment.issueId),
      this.userRepository.findById(assignment.userId),
    ]);
    const [workspace, githubRepository] = await Promise.all([
      this.workspaceRepository.findById(plan.workspaceId),
      this.githubRepositoryRepository.findById(issue.repositoryId),
    ]);

    if (!workspace.capacityPlanningSync || !workspace.githubInstallationId) {
      return;
    }

    if (!this.isPlanActive(plan)) {
      return;
    }

    await this.githubService.setIssueAssignees(
      Number(workspace.githubInstallationId),
      githubRepository.fullName,
      issue.githubIssueNumber,
      [user.username],
    );

    await this.auditEventService.record({
      actorUserId: assignment.userId,
      workspaceId: plan.workspaceId,
      action: 'capacity-planning.assignment.synced',
      resourceType: 'issue-assignment',
      resourceId: String(assignment.id),
      source: 'system',
      payload: {
        issueId: assignment.issueId,
        githubIssueNumber: issue.githubIssueNumber,
        repositoryFullName: githubRepository.fullName,
        assignee: user.username,
      },
    });
  }

  async syncActiveCapacityPlans(): Promise<number> {
    const workspaces = await this.workspaceRepository.find();
    let syncedIssueCount = 0;

    for (const workspace of workspaces) {
      if (
        !workspace.id ||
        !workspace.capacityPlanningSync ||
        !workspace.githubInstallationId
      ) {
        continue;
      }

      syncedIssueCount += await this.syncActiveWorkspacePlan(workspace.id);
    }

    return syncedIssueCount;
  }

  async syncActiveWorkspacePlan(workspaceId: number): Promise<number> {
    const workspace = await this.workspaceRepository.findById(workspaceId);

    if (!workspace.capacityPlanningSync || !workspace.githubInstallationId) {
      return 0;
    }

    const activePlan = await this.resolveActiveCapacityPlan(workspaceId);

    if (!activePlan?.id) {
      return 0;
    }

    const assignments = await this.issueAssignmentRepository.find({
      where: {capacityPlanId: activePlan.id},
    });
    const assignmentsByIssueId = new Map<number, IssueAssignment[]>();

    for (const assignment of assignments) {
      const issueAssignments =
        assignmentsByIssueId.get(assignment.issueId) ?? [];

      issueAssignments.push(assignment);
      assignmentsByIssueId.set(assignment.issueId, issueAssignments);
    }

    for (const [issueId, issueAssignments] of assignmentsByIssueId.entries()) {
      await this.syncIssueAssignmentsToGithub({
        workspace,
        plan: activePlan,
        issueId,
        assignments: issueAssignments,
      });
    }

    return assignmentsByIssueId.size;
  }

  async syncGithubIssueAssigneeChange({
    action,
    repositoryId,
    githubIssueId,
    githubIssueNumber,
    assignee,
  }: GithubIssueAssigneeSyncInput): Promise<void> {
    if (!assignee?.id && !assignee?.login?.trim()) {
      return;
    }

    const [githubRepository, issue] = await Promise.all([
      this.githubRepositoryRepository.findById(repositoryId),
      this.githubIssueRepository.findOne({
        where: {
          repositoryId,
          githubId: githubIssueId,
        },
        include: ['aiPrediction'],
      }),
    ]);

    if (!issue) {
      console.warn(
        'Skipping GitHub assignee sync because the issue is not stored locally.',
        {
          repositoryId,
          githubIssueId,
          githubIssueNumber,
        },
      );
      return;
    }

    const workspace = await this.workspaceRepository.findById(
      githubRepository.workspaceId,
    );

    if (!workspace.capacityPlanningSync) {
      return;
    }

    const user = await this.resolveAssigneeUser(assignee);

    if (!user) {
      console.warn(
        'Skipping GitHub assignee sync because the assignee is not mapped to a local user.',
        {
          repositoryId,
          githubIssueId,
          githubIssueNumber,
          assignee,
        },
      );
      return;
    }

    const activePlan = await this.resolveCapacityPlan(workspace.id);

    if (!activePlan) {
      console.warn(
        'Skipping GitHub assignee sync because the workspace has no capacity plan.',
        {
          workspaceId: workspace.id,
          repositoryId,
          githubIssueId,
          githubIssueNumber,
        },
      );
      return;
    }

    if (action === 'assigned') {
      await this.createGithubSyncedAssignment({
        plan: activePlan,
        issue,
        userId: user.id,
        assigneeLogin: assignee.login ?? user.username,
        repositoryFullName: githubRepository.fullName,
      });
      return;
    }

    await this.removeGithubSyncedAssignment({
      plan: activePlan,
      issue,
      userId: user.id,
      assigneeLogin: assignee.login ?? user.username,
      repositoryFullName: githubRepository.fullName,
    });
  }

  private async resolveAssigneeUser(assignee: GithubAssigneeIdentity) {
    if (assignee.id) {
      const user = await this.userRepository.findOne({
        where: {githubId: assignee.id},
      });

      if (user) {
        return user;
      }
    }

    const login = assignee.login?.trim();

    if (!login) {
      return null;
    }

    return this.userRepository.findOne({
      where: {username: login},
    });
  }

  private async resolveCapacityPlan(
    workspaceId: number,
  ): Promise<CapacityPlan | null> {
    const now = new Date().toISOString();
    const activePlan = await this.capacityPlanRepository.findOne({
      where: {
        workspaceId,
        start: {lte: now},
        end: {gte: now},
      },
      order: ['start DESC'],
    });

    if (activePlan) {
      return activePlan;
    }

    return this.capacityPlanRepository.findOne({
      where: {workspaceId},
      order: ['start DESC'],
    });
  }

  private async resolveActiveCapacityPlan(
    workspaceId: number,
  ): Promise<CapacityPlan | null> {
    const now = new Date().toISOString();

    return this.capacityPlanRepository.findOne({
      where: {
        workspaceId,
        start: {lte: now},
        end: {gte: now},
      },
      order: ['start DESC'],
    });
  }

  private isPlanActive(plan: CapacityPlan): boolean {
    const now = Date.now();
    const start = new Date(plan.start).getTime();
    const end = new Date(plan.end).getTime();

    return start <= now && end >= now;
  }

  private async syncIssueAssignmentsToGithub({
    workspace,
    plan,
    issueId,
    assignments,
  }: {
    workspace: {githubInstallationId?: string | number | null};
    plan: CapacityPlan;
    issueId: number;
    assignments: IssueAssignment[];
  }): Promise<void> {
    const issue = await this.githubIssueRepository.findById(issueId);
    const githubRepository = await this.githubRepositoryRepository.findById(
      issue.repositoryId,
    );
    const users = await Promise.all(
      assignments.map(assignment =>
        this.userRepository.findById(assignment.userId),
      ),
    );
    const assignees = Array.from(
      new Set(
        users
          .map(user => user.username)
          .filter((username): username is string => Boolean(username?.trim())),
      ),
    );

    await this.githubService.setIssueAssignees(
      Number(workspace.githubInstallationId),
      githubRepository.fullName,
      issue.githubIssueNumber,
      assignees,
    );

    await this.auditEventService.record({
      workspaceId: plan.workspaceId,
      action: 'capacity-planning.active-plan.synced',
      resourceType: 'capacity-plan',
      resourceId: String(plan.id),
      source: 'system',
      payload: {
        issueId,
        githubIssueNumber: issue.githubIssueNumber,
        repositoryFullName: githubRepository.fullName,
        assignees,
      },
    });
  }

  private async createGithubSyncedAssignment({
    plan,
    issue,
    userId,
    assigneeLogin,
    repositoryFullName,
  }: {
    plan: CapacityPlan;
    issue: GithubIssue;
    userId: number;
    assigneeLogin: string;
    repositoryFullName: string;
  }): Promise<void> {
    const existingAssignment = await this.issueAssignmentRepository.findOne({
      where: {
        capacityPlanId: plan.id,
        issueId: issue.id,
        userId,
      },
    });

    if (existingAssignment) {
      return;
    }

    const assignment = await this.issueAssignmentRepository.create({
      capacityPlanId: plan.id,
      issueId: issue.id,
      userId,
      assignedHours: issue.aiPrediction?.estimatedHours ?? 0,
    });

    await this.auditEventService.record({
      actorUserId: userId,
      workspaceId: plan.workspaceId,
      action: 'capacity-planning.assignment.imported',
      resourceType: 'issue-assignment',
      resourceId: String(assignment.id),
      source: 'github',
      payload: {
        issueId: issue.id,
        githubIssueNumber: issue.githubIssueNumber,
        repositoryFullName,
        assignee: assigneeLogin,
      },
    });
  }

  private async removeGithubSyncedAssignment({
    plan,
    issue,
    userId,
    assigneeLogin,
    repositoryFullName,
  }: {
    plan: CapacityPlan;
    issue: GithubIssue;
    userId: number;
    assigneeLogin: string;
    repositoryFullName: string;
  }): Promise<void> {
    const assignment = await this.issueAssignmentRepository.findOne({
      where: {
        capacityPlanId: plan.id,
        issueId: issue.id,
        userId,
      },
    });

    if (!assignment?.id) {
      return;
    }

    await this.issueAssignmentRepository.deleteById(assignment.id);

    await this.auditEventService.record({
      actorUserId: userId,
      workspaceId: plan.workspaceId,
      action: 'capacity-planning.assignment.removed-from-github',
      resourceType: 'issue-assignment',
      resourceId: String(assignment.id),
      source: 'github',
      payload: {
        issueId: issue.id,
        githubIssueNumber: issue.githubIssueNumber,
        repositoryFullName,
        assignee: assigneeLogin,
      },
    });
  }
}
