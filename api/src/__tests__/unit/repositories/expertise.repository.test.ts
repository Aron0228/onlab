import {juggler} from '@loopback/repository';
import {describe, expect, it} from 'vitest';

import {ExpertiseRepository} from '../../../repositories';

describe('ExpertiseRepository (unit)', () => {
  it('registers workspace and user expertise association relations', () => {
    const dataSource = new juggler.DataSource({
      name: 'db',
      connector: 'memory',
    });
    const repository = new ExpertiseRepository(
      dataSource as never,
      async () => ({}) as never,
      async () => ({}) as never,
    );

    expect(typeof repository.workspace).toBe('function');
    expect(typeof repository.userExpertiseAssocs).toBe('function');
    expect(repository.inclusionResolvers.has('workspace')).toBe(true);
    expect(repository.inclusionResolvers.has('userExpertiseAssocs')).toBe(true);
  });
});
