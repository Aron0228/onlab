import {BindingScope, injectable, service} from '@loopback/core';
import {repository} from '@loopback/repository';
import {IssueAssignment} from '../models';
import {
  CapacityPlanRepository,
  GithubIssueRepository,
  GithubRepositoryRepository,
  UserRepository,
  WorkspaceRepository,
} from '../repositories';
import {GithubService} from './github-integration/github.service';

@injectable({scope: BindingScope.SINGLETON})
export class CapacityPlanningSyncService {
  constructor(
    @repository(CapacityPlanRepository)
    private capacityPlanRepository: CapacityPlanRepository,
    @repository(GithubIssueRepository)
    private githubIssueRepository: GithubIssueRepository,
    @repository(GithubRepositoryRepository)
    private githubRepositoryRepository: GithubRepositoryRepository,
    @repository(UserRepository)
    private userRepository: UserRepository,
    @repository(WorkspaceRepository)
    private workspaceRepository: WorkspaceRepository,
    @service(GithubService)
    private githubService: GithubService,
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

    await this.githubService.setIssueAssignees(
      Number(workspace.githubInstallationId),
      githubRepository.fullName,
      issue.githubIssueNumber,
      [user.username],
    );
  }
}
