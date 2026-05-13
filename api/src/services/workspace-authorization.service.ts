import {HttpErrors} from '@loopback/rest';
import {repository, Filter, Where} from '@loopback/repository';
import {securityId, UserProfile} from '@loopback/security';
import {
  WORKSPACE_MEMBER_ROLE,
  WORKSPACE_PERMISSION,
  WORKSPACE_ROLE,
  WorkspaceMemberRole,
  WorkspacePermission,
  WorkspaceRole,
} from '../constants';
import {Workspace, WorkspaceMember} from '../models';
import {WorkspaceMemberRepository, WorkspaceRepository} from '../repositories';

export type WorkspacePermissionDecision = {
  allowed: boolean;
  permission: WorkspacePermission;
  workspaceId: number;
  role: WorkspaceRole | null;
};

const ADMIN_PERMISSIONS = new Set<WorkspacePermission>([
  WORKSPACE_PERMISSION.WORKSPACE_SETTINGS_MANAGE,
  WORKSPACE_PERMISSION.WORKSPACE_MEMBERS_MANAGE,
  WORKSPACE_PERMISSION.CAPACITY_PLAN_MANAGE,
  WORKSPACE_PERMISSION.GITHUB_INSTALL_MANAGE,
  WORKSPACE_PERMISSION.GITHUB_ISSUE_MANAGE,
  WORKSPACE_PERMISSION.COMMUNICATION_MANAGE,
]);

const OWNER_PERMISSIONS = new Set<WorkspacePermission>([
  WORKSPACE_PERMISSION.WORKSPACE_DELETE,
  WORKSPACE_PERMISSION.AI_SETTINGS_MANAGE,
]);

const MEMBER_PERMISSIONS = new Set<WorkspacePermission>([
  WORKSPACE_PERMISSION.WORKSPACE_VIEW,
  WORKSPACE_PERMISSION.COMMUNICATION_VIEW,
  WORKSPACE_PERMISSION.GITHUB_PULL_REQUEST_VIEW,
]);

export class WorkspaceAuthorizationService {
  constructor(
    @repository(WorkspaceRepository)
    private workspaceRepository: WorkspaceRepository,
    @repository(WorkspaceMemberRepository)
    private workspaceMemberRepository: WorkspaceMemberRepository,
  ) {}

  getAuthenticatedUserId(userProfile: UserProfile | undefined): number {
    const rawId = userProfile?.id ?? userProfile?.[securityId];
    const userId =
      typeof rawId === 'number' ? rawId : Number.parseInt(String(rawId), 10);

    if (!Number.isFinite(userId)) {
      throw new HttpErrors.Unauthorized('Missing authenticated user.');
    }

    return userId;
  }

  async checkPermission(
    workspaceId: number,
    userId: number,
    permission: WorkspacePermission,
  ): Promise<WorkspacePermissionDecision> {
    const role = await this.getWorkspaceRole(workspaceId, userId);

    return {
      allowed: this.isAllowed(role, permission),
      permission,
      workspaceId,
      role,
    };
  }

  async assertPermission(
    workspaceId: number,
    userId: number,
    permission: WorkspacePermission,
  ): Promise<WorkspaceRole> {
    const decision = await this.checkPermission(
      workspaceId,
      userId,
      permission,
    );

    if (!decision.allowed || !decision.role) {
      throw new HttpErrors.Forbidden(
        'You do not have access to this workspace.',
      );
    }

    return decision.role;
  }

  async assertWorkspaceMember(
    workspaceId: number,
    userId: number,
  ): Promise<WorkspaceRole> {
    return this.assertPermission(
      workspaceId,
      userId,
      WORKSPACE_PERMISSION.WORKSPACE_VIEW,
    );
  }

  async assertWorkspaceAdminOrOwner(
    workspaceId: number,
    userId: number,
  ): Promise<WorkspaceRole> {
    return this.assertPermission(
      workspaceId,
      userId,
      WORKSPACE_PERMISSION.WORKSPACE_SETTINGS_MANAGE,
    );
  }

  async assertWorkspaceOwner(
    workspaceId: number,
    userId: number,
  ): Promise<WorkspaceRole> {
    return this.assertPermission(
      workspaceId,
      userId,
      WORKSPACE_PERMISSION.WORKSPACE_DELETE,
    );
  }

  async getWorkspaceRole(
    workspaceId: number,
    userId: number,
  ): Promise<WorkspaceRole | null> {
    const workspace = await this.workspaceRepository.findById(workspaceId);

    if (workspace.deletedAt) {
      return null;
    }

    if (workspace.ownerId === userId) {
      return WORKSPACE_ROLE.OWNER;
    }

    const membership = await this.workspaceMemberRepository.findOne({
      where: {
        workspaceId,
        userId,
      },
    });

    if (!membership) {
      return null;
    }

    return this.mapMemberRole(membership.role);
  }

  async workspaceAccessWhere(userId: number): Promise<Where<Workspace>> {
    const memberships = await this.workspaceMemberRepository.find({
      where: {userId},
    });
    const workspaceIds = memberships
      .map(member => member.workspaceId)
      .filter((workspaceId): workspaceId is number => workspaceId != null);

    return {
      and: [
        {deletedAt: null as never},
        {
          or: [{ownerId: userId}, {id: {inq: workspaceIds}}],
        },
      ],
    };
  }

  async accessibleWorkspaceIds(userId: number): Promise<number[]> {
    const workspaces = await this.workspaceRepository.find({
      where: await this.workspaceAccessWhere(userId),
    });

    return workspaces.map(workspace => workspace.id);
  }

  async mergeWorkspaceAccessFilter(
    filter: Filter<Workspace> | undefined,
    userId: number,
  ): Promise<Filter<Workspace>> {
    const accessWhere = await this.workspaceAccessWhere(userId);
    const existingWhere = filter?.where;

    return {
      ...filter,
      where: existingWhere ? {and: [existingWhere, accessWhere]} : accessWhere,
    };
  }

  async mergeWorkspaceMemberAccessWhere(
    where: Where<WorkspaceMember> | undefined,
    userId: number,
  ): Promise<Where<WorkspaceMember>> {
    const accessWhere = await this.workspaceAccessWhere(userId);
    const workspaces = await this.workspaceRepository.find({
      where: accessWhere,
    });
    const workspaceIds = workspaces.map(workspace => workspace.id);
    const membershipWhere: Where<WorkspaceMember> = {
      workspaceId: {inq: workspaceIds},
    };

    return where ? {and: [where, membershipWhere]} : membershipWhere;
  }

  private isAllowed(
    role: WorkspaceRole | null,
    permission: WorkspacePermission,
  ): boolean {
    if (!role) {
      return false;
    }

    if (role === WORKSPACE_ROLE.OWNER) {
      return true;
    }

    if (OWNER_PERMISSIONS.has(permission)) {
      return false;
    }

    if (role === WORKSPACE_ROLE.ADMIN) {
      return (
        ADMIN_PERMISSIONS.has(permission) || MEMBER_PERMISSIONS.has(permission)
      );
    }

    return MEMBER_PERMISSIONS.has(permission);
  }

  private mapMemberRole(
    role: WorkspaceMemberRole | undefined,
  ): WorkspaceRole | null {
    if (role === WORKSPACE_MEMBER_ROLE.ADMIN) {
      return WORKSPACE_ROLE.ADMIN;
    }

    if (role === WORKSPACE_MEMBER_ROLE.MEMBER) {
      return WORKSPACE_ROLE.MEMBER;
    }

    return null;
  }
}
