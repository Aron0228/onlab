export const WORKSPACE_PERMISSION = {
  WORKSPACE_VIEW: 'workspace.view',
  WORKSPACE_SETTINGS_MANAGE: 'workspace.settings.manage',
  WORKSPACE_MEMBERS_MANAGE: 'workspace.members.manage',
  WORKSPACE_DELETE: 'workspace.delete',
  GITHUB_INSTALL_MANAGE: 'github.install.manage',
  GITHUB_ISSUE_MANAGE: 'github.issue.manage',
  GITHUB_PULL_REQUEST_VIEW: 'github.pull-request.view',
  AI_SETTINGS_MANAGE: 'ai.settings.manage',
  CAPACITY_PLAN_MANAGE: 'capacity-plan.manage',
  COMMUNICATION_VIEW: 'communication.view',
} as const;

export type WorkspacePermission =
  (typeof WORKSPACE_PERMISSION)[keyof typeof WORKSPACE_PERMISSION];

export const WORKSPACE_ROLE = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const;

export type WorkspaceRole =
  (typeof WORKSPACE_ROLE)[keyof typeof WORKSPACE_ROLE];
