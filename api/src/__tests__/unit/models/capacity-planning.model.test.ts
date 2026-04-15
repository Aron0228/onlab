import {securityId} from '@loopback/security';
import {describe, expect, it} from 'vitest';

import {
  CapacityPlan,
  CapacityPlanEntryWithRelations,
  CapacityPlanWithRelations,
  CapacityPlanEntry,
  GithubIssue,
  IssueAssignment,
  IssueAssignmentWithRelations,
  User,
  Workspace,
} from '../../../models';

describe('Capacity planning models (unit)', () => {
  it('constructs capacity plans with date window values', () => {
    const model = new CapacityPlan({
      id: 8,
      workspaceId: 12,
      start: '2026-04-13T08:00:00.000Z',
      end: '2026-04-17T17:00:00.000Z',
    });

    expect(model.id).toBe(8);
    expect(model.workspaceId).toBe(12);
    expect(model.start).toBe('2026-04-13T08:00:00.000Z');
    expect(model.end).toBe('2026-04-17T17:00:00.000Z');
  });

  it('allows capacity plans to hold entry and assignment relations', () => {
    const model: CapacityPlanWithRelations = new CapacityPlan({
      workspaceId: 3,
      start: '2026-04-13T08:00:00.000Z',
      end: '2026-04-17T17:00:00.000Z',
    });

    model.workspace = new Workspace({id: 3, name: 'Delivery', ownerId: 5});
    model.entries = [];
    model.issueAssignments = [];

    expect(model.workspace?.name).toBe('Delivery');
    expect(model.entries).toEqual([]);
    expect(model.issueAssignments).toEqual([]);
  });

  it('constructs capacity plan entries with assigned user hours', () => {
    const model = new CapacityPlanEntry({
      id: 4,
      capacityPlanId: 8,
      userId: 5,
      capacityHours: 24,
    });

    expect(model.id).toBe(4);
    expect(model.capacityPlanId).toBe(8);
    expect(model.userId).toBe(5);
    expect(model.capacityHours).toBe(24);
  });

  it('allows capacity plan entries to hold capacity plan and user relations', () => {
    const model: CapacityPlanEntryWithRelations = new CapacityPlanEntry({
      capacityPlanId: 8,
      userId: 5,
      capacityHours: 16,
    });

    model.capacityPlan = new CapacityPlan({
      id: 8,
      workspaceId: 3,
      start: '2026-04-13T08:00:00.000Z',
      end: '2026-04-17T17:00:00.000Z',
    });
    model.user = new User({id: 5, username: 'aron0228'});

    expect(model.capacityPlan?.id).toBe(8);
    expect(model.user?.username).toBe('aron0228');
  });

  it('constructs issue assignments with their issue, user, and plan ids', () => {
    const model = new IssueAssignment({
      id: 9,
      issueId: 11,
      userId: 5,
      capacityPlanId: 8,
      assignedHours: 6,
    });

    expect(model.id).toBe(9);
    expect(model.issueId).toBe(11);
    expect(model.userId).toBe(5);
    expect(model.capacityPlanId).toBe(8);
    expect(model.assignedHours).toBe(6);
  });

  it('allows issue assignments and existing models to hold planning relations', () => {
    const issueAssignment: IssueAssignmentWithRelations = new IssueAssignment({
      issueId: 11,
      userId: 5,
      capacityPlanId: 8,
      assignedHours: 10,
    });
    issueAssignment.issue = new GithubIssue({
      id: 11,
      repositoryId: 4,
      githubId: 401,
      githubIssueNumber: 17,
      title: 'Broken auth guard',
      status: 'open',
      description: 'Users can bypass authorization.',
    });
    issueAssignment.user = new User({id: 5, username: 'aron0228'});
    issueAssignment.capacityPlan = new CapacityPlan({
      id: 8,
      workspaceId: 3,
      start: '2026-04-13T08:00:00.000Z',
      end: '2026-04-17T17:00:00.000Z',
    });

    const user = new User({id: 5, username: 'aron0228'});
    user.capacityPlanEntries = [];
    user.issueAssignments = [issueAssignment];

    const workspace = new Workspace({id: 3, name: 'Delivery', ownerId: 5});
    workspace.capacityPlans = [issueAssignment.capacityPlan];

    const issue = new GithubIssue({
      id: 11,
      repositoryId: 4,
      githubId: 401,
      githubIssueNumber: 17,
      title: 'Broken auth guard',
      status: 'open',
      description: 'Users can bypass authorization.',
    });
    issue.issueAssignments = [issueAssignment];

    expect(issueAssignment.issue?.title).toBe('Broken auth guard');
    expect(user.capacityPlanEntries).toEqual([]);
    expect(user.issueAssignments).toHaveLength(1);
    expect(workspace.capacityPlans).toHaveLength(1);
    expect(issue.issueAssignments).toHaveLength(1);
  });

  it('keeps existing user profile and github issue AI relations working', () => {
    const user = new User({id: 5, username: 'aron0228'});
    const issue = new GithubIssue({
      id: 11,
      repositoryId: 4,
      githubId: 401,
      githubIssueNumber: 17,
      title: 'Broken auth guard',
      status: 'open',
      description: 'Users can bypass authorization.',
    });

    issue.aiPrediction = null;

    expect(user.toUserProfile()).toEqual({
      id: 5,
      [securityId]: '5',
    });
    expect(issue.aiPrediction).toBeNull();
  });
});
