import {beforeEach, describe, expect, it, vi} from 'vitest';

import {File} from '../../../models';
import {FileController} from '../../../controllers/system/file.controller';

describe('FileController (unit)', () => {
  let repository: {
    find: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    upload: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
    preview: ReturnType<typeof vi.fn>;
    stream: ReturnType<typeof vi.fn>;
  };
  let messageAttachmentRepository: {
    find: ReturnType<typeof vi.fn>;
  };
  let channelMemberRepository: {
    findOne: ReturnType<typeof vi.fn>;
  };
  let authorization: {
    getAuthenticatedUserId: ReturnType<typeof vi.fn>;
    accessibleWorkspaceIds: ReturnType<typeof vi.fn>;
    assertWorkspaceMember: ReturnType<typeof vi.fn>;
  };
  let auditEventService: {record: ReturnType<typeof vi.fn>};
  let controller: FileController;

  beforeEach(() => {
    repository = {
      find: vi.fn(),
      count: vi.fn(),
      findById: vi.fn(),
      upload: vi.fn(),
      download: vi.fn(),
      preview: vi.fn(),
      stream: vi.fn(),
    };
    messageAttachmentRepository = {
      find: vi.fn().mockResolvedValue([]),
    };
    channelMemberRepository = {
      findOne: vi.fn().mockResolvedValue({id: 12}),
    };
    authorization = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(7),
      accessibleWorkspaceIds: vi.fn().mockResolvedValue([11]),
      assertWorkspaceMember: vi.fn().mockResolvedValue('MEMBER'),
    };
    auditEventService = {
      record: vi.fn().mockResolvedValue(undefined),
    };
    controller = new FileController(
      repository as never,
      messageAttachmentRepository as never,
      channelMemberRepository as never,
      authorization as never,
      auditEventService as never,
    );
  });

  it('scopes file queries to accessible workspaces', async () => {
    const file = new File({
      id: 31,
      workspaceId: 11,
      originalName: 'avatar.png',
      mimeType: 'image/png',
      size: 2048,
      path: '/uploads/avatar.png',
    });
    repository.find.mockResolvedValue([file]);

    await expect(
      controller.find({id: 7} as never, {where: {mimeType: 'image/png'}}),
    ).resolves.toEqual([file]);
    expect(repository.find).toHaveBeenCalledWith({
      where: {
        and: [{mimeType: 'image/png'}, {workspaceId: {inq: [11]}}],
      },
    });
  });

  it('checks workspace membership before upload and streaming', async () => {
    const request = {query: {workspaceId: '11'}};
    const response = {status: vi.fn()};
    const uploadResult = new File({
      id: 31,
      workspaceId: 11,
      originalName: 'avatar.png',
      mimeType: 'image/png',
      size: 2048,
      path: '/uploads/avatar.png',
    });
    repository.upload.mockResolvedValue(uploadResult);
    repository.findById.mockResolvedValue(
      new File({
        id: 31,
        workspaceId: 11,
        originalName: 'avatar.png',
        mimeType: 'image/png',
        size: 2048,
        path: '/uploads/avatar.png',
      }),
    );
    repository.download.mockResolvedValue(response);
    repository.preview.mockResolvedValue(response);
    repository.stream.mockResolvedValue(response);

    await expect(
      controller.upload({id: 7} as never, request as never, response as never),
    ).resolves.toEqual(uploadResult);
    await expect(
      controller.download({id: 7} as never, 31, response as never),
    ).resolves.toEqual(response);
    await expect(
      controller.preview({id: 7} as never, 31, response as never),
    ).resolves.toEqual(response);
    await expect(
      controller.stream({id: 7} as never, 31, response as never),
    ).resolves.toEqual(response);

    expect(authorization.assertWorkspaceMember).toHaveBeenCalledWith(11, 7);
    expect(repository.upload).toHaveBeenCalledWith(request, response);
    expect(repository.download).toHaveBeenCalledWith(31, response);
    expect(repository.preview).toHaveBeenCalledWith(31, response);
    expect(repository.stream).toHaveBeenCalledWith(31, response);
    expect(auditEventService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 7,
        workspaceId: 11,
        action: 'file.uploaded',
        resourceType: 'file',
        resourceId: '31',
        payload: {
          originalName: 'avatar.png',
          mimeType: 'image/png',
          size: 2048,
        },
      }),
    );
  });

  it('requires channel membership for message attachment files', async () => {
    const response = {status: vi.fn()};
    repository.findById.mockResolvedValue(
      new File({
        id: 31,
        workspaceId: 11,
        originalName: 'mockup.png',
        mimeType: 'image/png',
        size: 2048,
        path: '/uploads/mockup.png',
      }),
    );
    messageAttachmentRepository.find.mockResolvedValue([
      {id: 4, fileId: 31, message: {id: 55, channelId: 20}},
    ]);
    repository.preview.mockResolvedValue(response);

    await expect(
      controller.preview({id: 7} as never, 31, response as never),
    ).resolves.toEqual(response);

    expect(channelMemberRepository.findOne).toHaveBeenCalledWith({
      where: {userId: 7, channelId: {inq: [20]}},
    });
  });

  it('rejects message attachment files for users outside the channel', async () => {
    const response = {status: vi.fn()};
    repository.findById.mockResolvedValue(
      new File({
        id: 31,
        workspaceId: 11,
        originalName: 'mockup.png',
        mimeType: 'image/png',
        size: 2048,
        path: '/uploads/mockup.png',
      }),
    );
    messageAttachmentRepository.find.mockResolvedValue([
      {id: 4, fileId: 31, message: {id: 55, channelId: 20}},
    ]);
    channelMemberRepository.findOne.mockResolvedValue(null);

    await expect(
      controller.download({id: 7} as never, 31, response as never),
    ).rejects.toThrow('You do not have access to this file.');
  });
});
