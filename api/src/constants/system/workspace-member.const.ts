export const WORKSPACE_MEMBER_ROLE = {
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const;

export type WorkspaceMemberRole =
  (typeof WORKSPACE_MEMBER_ROLE)[keyof typeof WORKSPACE_MEMBER_ROLE];
