import {juggler} from '@loopback/repository';
import {describe, expect, it, vi} from 'vitest';
import {AuditEventRepository} from '../../../repositories';

describe('AuditEventRepository (unit)', () => {
  it('registers actor and workspace relations', () => {
    const dataSource = new juggler.DataSource({
      name: 'db',
      connector: 'memory',
    });
    const repository = new AuditEventRepository(
      dataSource as never,
      vi.fn().mockResolvedValue({}) as never,
      vi.fn().mockResolvedValue({}) as never,
    );

    expect(typeof repository.actor).toBe('function');
    expect(typeof repository.workspace).toBe('function');
    expect(repository.inclusionResolvers.has('actor')).toBe(true);
    expect(repository.inclusionResolvers.has('workspace')).toBe(true);
  });
});
