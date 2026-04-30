import {juggler} from '@loopback/repository';
import {describe, expect, it} from 'vitest';

import {
  ChannelMemberRepository,
  ChannelRepository,
  MessageAttachmentRepository,
  MessageRepository,
} from '../../../repositories';

describe('Communication repositories (unit)', () => {
  function createDataSource() {
    return new juggler.DataSource({
      name: 'db',
      connector: 'memory',
    });
  }

  const emptyGetter = async () => ({}) as never;

  it('registers channel relations and inclusion resolvers', () => {
    const repository = new ChannelRepository(
      createDataSource() as never,
      emptyGetter,
      emptyGetter,
      emptyGetter,
      emptyGetter,
    );

    expect(typeof repository.workspace).toBe('function');
    expect(typeof repository.createdBy).toBe('function');
    expect(typeof repository.members).toBe('function');
    expect(typeof repository.messages).toBe('function');
    expect(repository.inclusionResolvers.has('workspace')).toBe(true);
    expect(repository.inclusionResolvers.has('createdBy')).toBe(true);
    expect(repository.inclusionResolvers.has('members')).toBe(true);
    expect(repository.inclusionResolvers.has('messages')).toBe(true);
  });

  it('registers channel member relations and inclusion resolvers', () => {
    const repository = new ChannelMemberRepository(
      createDataSource() as never,
      emptyGetter,
      emptyGetter,
    );

    expect(typeof repository.channel).toBe('function');
    expect(typeof repository.user).toBe('function');
    expect(repository.inclusionResolvers.has('channel')).toBe(true);
    expect(repository.inclusionResolvers.has('user')).toBe(true);
  });

  it('registers message relations and inclusion resolvers', () => {
    const repository = new MessageRepository(
      createDataSource() as never,
      emptyGetter,
      emptyGetter,
      emptyGetter,
    );

    expect(typeof repository.channel).toBe('function');
    expect(typeof repository.sender).toBe('function');
    expect(typeof repository.attachments).toBe('function');
    expect(repository.inclusionResolvers.has('channel')).toBe(true);
    expect(repository.inclusionResolvers.has('sender')).toBe(true);
    expect(repository.inclusionResolvers.has('attachments')).toBe(true);
  });

  it('registers message attachment relations and inclusion resolvers', () => {
    const repository = new MessageAttachmentRepository(
      createDataSource() as never,
      emptyGetter,
      emptyGetter,
    );

    expect(typeof repository.message).toBe('function');
    expect(typeof repository.file).toBe('function');
    expect(repository.inclusionResolvers.has('message')).toBe(true);
    expect(repository.inclusionResolvers.has('file')).toBe(true);
  });
});
