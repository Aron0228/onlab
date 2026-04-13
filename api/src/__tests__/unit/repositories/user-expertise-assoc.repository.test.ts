import {juggler} from '@loopback/repository';
import {describe, expect, it} from 'vitest';

import {UserExpertiseAssocRepository} from '../../../repositories';

describe('UserExpertiseAssocRepository (unit)', () => {
  it('registers user and expertise relations', () => {
    const dataSource = new juggler.DataSource({
      name: 'db',
      connector: 'memory',
    });
    const repository = new UserExpertiseAssocRepository(
      dataSource as never,
      async () => ({}) as never,
      async () => ({}) as never,
    );

    expect(typeof repository.user).toBe('function');
    expect(typeof repository.expertise).toBe('function');
    expect(repository.inclusionResolvers.has('user')).toBe(true);
    expect(repository.inclusionResolvers.has('expertise')).toBe(true);
  });
});
