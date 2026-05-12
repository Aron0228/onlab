import {juggler} from '@loopback/repository';
import {describe, expect, it, vi} from 'vitest';
import {NotificationRepository} from '../../../repositories';

describe('NotificationRepository (unit)', () => {
  it('registers user and workspace relations', () => {
    const dataSource = new juggler.DataSource({
      name: 'db',
      connector: 'memory',
    });
    const repository = new NotificationRepository(
      dataSource as never,
      vi.fn().mockResolvedValue({}) as never,
      vi.fn().mockResolvedValue({}) as never,
    );

    expect(typeof repository.user).toBe('function');
    expect(typeof repository.workspace).toBe('function');
    expect(repository.inclusionResolvers.has('user')).toBe(true);
    expect(repository.inclusionResolvers.has('workspace')).toBe(true);
  });
});
