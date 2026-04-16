import {juggler} from '@loopback/repository';
import {describe, expect, it} from 'vitest';

import {
  CapacityPlanEntryRepository,
  CapacityPlanRepository,
  GithubIssueRepository,
  IssueAssignmentRepository,
  UserRepository,
  WorkspaceRepository,
} from '../../../repositories';

describe('Capacity planning repositories (unit)', () => {
  const dataSource = new juggler.DataSource({
    name: 'db',
    connector: 'memory',
  });

  it('registers capacity plan relations', () => {
    const repository = new CapacityPlanRepository(
      dataSource as never,
      {} as never,
      async () => ({}) as never,
      async () => ({}) as never,
      async () => ({}) as never,
    );

    expect(typeof repository.workspace).toBe('function');
    expect(typeof repository.entries).toBe('function');
    expect(typeof repository.issueAssignments).toBe('function');
    expect(repository.inclusionResolvers.has('workspace')).toBe(true);
    expect(repository.inclusionResolvers.has('entries')).toBe(true);
    expect(repository.inclusionResolvers.has('issueAssignments')).toBe(true);
  });

  it('registers capacity plan entry relations', () => {
    const repository = new CapacityPlanEntryRepository(
      dataSource as never,
      async () => ({}) as never,
      async () => ({}) as never,
    );

    expect(typeof repository.capacityPlan).toBe('function');
    expect(typeof repository.user).toBe('function');
    expect(repository.inclusionResolvers.has('capacityPlan')).toBe(true);
    expect(repository.inclusionResolvers.has('user')).toBe(true);
  });

  it('registers issue assignment relations', () => {
    const repository = new IssueAssignmentRepository(
      dataSource as never,
      async () => ({}) as never,
      async () => ({}) as never,
      async () => ({}) as never,
    );

    expect(typeof repository.issue).toBe('function');
    expect(typeof repository.user).toBe('function');
    expect(typeof repository.capacityPlan).toBe('function');
    expect(repository.inclusionResolvers.has('issue')).toBe(true);
    expect(repository.inclusionResolvers.has('user')).toBe(true);
    expect(repository.inclusionResolvers.has('capacityPlan')).toBe(true);
  });

  it('registers user planning relations', () => {
    const repository = new UserRepository(
      dataSource as never,
      async () => ({}) as never,
      async () => ({}) as never,
      async () => ({}) as never,
    );

    expect(typeof repository.userExpertiseAssocs).toBe('function');
    expect(typeof repository.capacityPlanEntries).toBe('function');
    expect(typeof repository.issueAssignments).toBe('function');
    expect(repository.inclusionResolvers.has('userExpertiseAssocs')).toBe(true);
    expect(repository.inclusionResolvers.has('capacityPlanEntries')).toBe(true);
    expect(repository.inclusionResolvers.has('issueAssignments')).toBe(true);
  });

  it('registers workspace capacity plan relations', () => {
    const repository = new WorkspaceRepository(
      dataSource as never,
      async () => ({}) as never,
      async () => ({}) as never,
      async () => ({}) as never,
      async () => ({}) as never,
      async () => ({}) as never,
    );

    expect(typeof repository.owner).toBe('function');
    expect(typeof repository.capacityPlans).toBe('function');
    expect(repository.inclusionResolvers.has('owner')).toBe(true);
    expect(repository.inclusionResolvers.has('capacityPlans')).toBe(true);
  });

  it('registers github issue assignment relations', () => {
    const repository = new GithubIssueRepository(
      dataSource as never,
      {} as never,
      async () => ({}) as never,
      async () => ({}) as never,
      async () => ({}) as never,
    );

    expect(typeof repository.repository).toBe('function');
    expect(typeof repository.issueAssignments).toBe('function');
    expect(repository.inclusionResolvers.has('repository')).toBe(true);
    expect(repository.inclusionResolvers.has('issueAssignments')).toBe(true);
  });
});
