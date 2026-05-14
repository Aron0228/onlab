import {HttpErrors} from '@loopback/rest';
import {UserProfile, securityId} from '@loopback/security';
import {vi} from 'vitest';
import {WORKSPACE_PERMISSION, WORKSPACE_ROLE} from '../../constants';
import {WorkspacePermission} from '../../constants/system/workspace-permission.const';

export const workspaceId = 3;
const MEMBER_PERMISSIONS: WorkspacePermission[] = [
  WORKSPACE_PERMISSION.WORKSPACE_VIEW,
  WORKSPACE_PERMISSION.COMMUNICATION_VIEW,
  WORKSPACE_PERMISSION.GITHUB_PULL_REQUEST_VIEW,
];

export const securityUsers = {
  owner: profile(1, 'owner@example.com'),
  admin: profile(2, 'admin@example.com'),
  member: profile(3, 'member@example.com'),
  outsider: profile(4, 'outsider@example.com'),
};

export function profile(id: number, email?: string): UserProfile {
  return {
    [securityId]: String(id),
    id,
    email,
  };
}

export function createAuthorizationMock(
  roleByUserId: Record<number, string | null> = {
    1: WORKSPACE_ROLE.OWNER,
    2: WORKSPACE_ROLE.ADMIN,
    3: WORKSPACE_ROLE.MEMBER,
    4: null,
  },
): {
  getAuthenticatedUserId: ReturnType<typeof vi.fn>;
  checkPermission: ReturnType<typeof vi.fn>;
  assertPermission: ReturnType<typeof vi.fn>;
  assertWorkspaceMember: ReturnType<typeof vi.fn>;
  assertWorkspaceAdminOrOwner: ReturnType<typeof vi.fn>;
  accessibleWorkspaceIds: ReturnType<typeof vi.fn>;
} {
  const roleFor = (userId: number) => roleByUserId[userId] ?? null;

  return {
    getAuthenticatedUserId: vi.fn((userProfile: UserProfile) =>
      Number(userProfile.id ?? userProfile[securityId]),
    ),
    checkPermission: vi.fn(
      async (
        requestedWorkspaceId: number,
        userId: number,
        permission: WorkspacePermission,
      ) => ({
        allowed: can(roleFor(userId), permission),
        permission,
        workspaceId: requestedWorkspaceId,
        role: roleFor(userId),
      }),
    ),
    assertPermission: vi.fn(
      async (
        _requestedWorkspaceId: number,
        userId: number,
        permission: WorkspacePermission,
      ) => {
        const role = roleFor(userId);
        if (!can(role, permission)) {
          throw new HttpErrors.Forbidden('Forbidden');
        }

        return role;
      },
    ),
    assertWorkspaceMember: vi.fn(
      async (_requestedWorkspaceId: number, userId: number) => {
        const role = roleFor(userId);
        if (!role) {
          throw new HttpErrors.Forbidden('Forbidden');
        }

        return role;
      },
    ),
    assertWorkspaceAdminOrOwner: vi.fn(
      async (_requestedWorkspaceId: number, userId: number) => {
        const role = roleFor(userId);
        if (role !== WORKSPACE_ROLE.OWNER && role !== WORKSPACE_ROLE.ADMIN) {
          throw new HttpErrors.Forbidden('Forbidden');
        }

        return role;
      },
    ),
    accessibleWorkspaceIds: vi.fn(async (userId: number) =>
      roleFor(userId) ? [workspaceId] : [],
    ),
  };
}

function can(role: string | null, permission: WorkspacePermission): boolean {
  if (role === WORKSPACE_ROLE.OWNER) return true;

  if (role === WORKSPACE_ROLE.ADMIN) {
    return permission !== WORKSPACE_PERMISSION.WORKSPACE_DELETE;
  }

  if (role === WORKSPACE_ROLE.MEMBER) {
    return MEMBER_PERMISSIONS.includes(permission);
  }

  return false;
}
