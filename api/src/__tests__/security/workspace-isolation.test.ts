import {HttpErrors} from '@loopback/rest';
import {describe, expect, it, vi} from 'vitest';
import {CommunicationController} from '../../controllers/communication';
import {GithubRepositoryController} from '../../controllers/github/repository.controller';
import {FileController} from '../../controllers/system/file.controller';
import {InvitationController} from '../../controllers/system/invitation.controller';
import {GithubRepository, Invitation, File} from '../../models';
import {createAuthorizationMock, securityUsers, workspaceId} from './helpers';

describe('security: workspace scoped controller isolation', () => {
  it('scopes GitHub repository reads against spoofed workspace filters', async () => {
    const authorization = createAuthorizationMock();
    const repository = {
      find: vi.fn().mockResolvedValue([]),
    };
    const controller = new GithubRepositoryController(
      repository as never,
      authorization as never,
    );

    await expect(
      controller.find(securityUsers.member, {where: {workspaceId: 99}}),
    ).resolves.toEqual([]);

    expect(repository.find).toHaveBeenCalledWith({
      where: {
        and: [{workspaceId: 99}, {workspaceId: {inq: [workspaceId]}}],
      },
    });
  });

  it('denies outsiders reading a GitHub repository by id', async () => {
    const authorization = createAuthorizationMock();
    const repository = {
      findById: vi.fn().mockResolvedValue(
        new GithubRepository({
          id: 4,
          workspaceId,
          githubRepoId: 100,
          name: 'api',
          fullName: 'team/api',
        }),
      ),
    };
    const controller = new GithubRepositoryController(
      repository as never,
      authorization as never,
    );

    await expect(
      controller.findById(securityUsers.outsider, 4),
    ).rejects.toBeInstanceOf(HttpErrors.Forbidden);
  });

  it('scopes invitation reads against spoofed workspace filters', async () => {
    const authorization = createAuthorizationMock();
    const repository = {
      find: vi.fn().mockResolvedValue([]),
    };
    const controller = new InvitationController(
      repository as never,
      authorization as never,
      {record: vi.fn()} as never,
    );

    await expect(
      controller.find(securityUsers.member, {where: {workspaceId: 99}}),
    ).resolves.toEqual([]);

    expect(repository.find).toHaveBeenCalledWith({
      where: {
        and: [{workspaceId: 99}, {workspaceId: {inq: [workspaceId]}}],
      },
    });
  });

  it('denies outsiders reading invitations by id', async () => {
    const authorization = createAuthorizationMock();
    const repository = {
      findById: vi.fn().mockResolvedValue(
        new Invitation({
          id: 6,
          workspaceId,
          email: 'member@example.com',
        }),
      ),
    };
    const controller = new InvitationController(
      repository as never,
      authorization as never,
      {record: vi.fn()} as never,
    );

    await expect(
      controller.findById(securityUsers.outsider, 6),
    ).rejects.toBeInstanceOf(HttpErrors.Forbidden);
  });

  it('denies outsiders opening workspace communication channels', async () => {
    const communicationService = {
      listChannels: vi.fn().mockRejectedValue(new HttpErrors.Forbidden()),
    };
    const controller = new CommunicationController(
      communicationService as never,
    );

    await expect(
      controller.listChannels(workspaceId, securityUsers.outsider),
    ).rejects.toBeInstanceOf(HttpErrors.Forbidden);
  });

  it('denies channel attachment files to users outside the channel', async () => {
    const authorization = createAuthorizationMock();
    const fileRepository = {
      findById: vi.fn().mockResolvedValue(
        new File({
          id: 30,
          workspaceId,
          originalName: 'mockup.png',
          mimeType: 'image/png',
          size: 2048,
          path: '/uploads/mockup.png',
        }),
      ),
      preview: vi.fn(),
    };
    const messageAttachmentRepository = {
      find: vi.fn().mockResolvedValue([{fileId: 30, message: {channelId: 20}}]),
    };
    const channelMemberRepository = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    const controller = new FileController(
      fileRepository as never,
      messageAttachmentRepository as never,
      channelMemberRepository as never,
      authorization as never,
      {record: vi.fn()} as never,
    );

    await expect(
      controller.preview(securityUsers.member, 30, {} as never),
    ).rejects.toBeInstanceOf(HttpErrors.Forbidden);

    expect(fileRepository.preview).not.toHaveBeenCalled();
  });
});
