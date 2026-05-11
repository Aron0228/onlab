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
  };
  let authorization: {
    getAuthenticatedUserId: ReturnType<typeof vi.fn>;
    accessibleWorkspaceIds: ReturnType<typeof vi.fn>;
    assertWorkspaceMember: ReturnType<typeof vi.fn>;
  };
  let controller: FileController;

  beforeEach(() => {
    repository = {
      find: vi.fn(),
      count: vi.fn(),
      findById: vi.fn(),
      upload: vi.fn(),
      download: vi.fn(),
      preview: vi.fn(),
    };
    authorization = {
      getAuthenticatedUserId: vi.fn().mockReturnValue(7),
      accessibleWorkspaceIds: vi.fn().mockResolvedValue([11]),
      assertWorkspaceMember: vi.fn().mockResolvedValue('MEMBER'),
    };
    controller = new FileController(
      repository as never,
      authorization as never,
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
    const uploadResult = {id: 31, url: '/files/31/preview'};
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

    await expect(
      controller.upload({id: 7} as never, request as never, response as never),
    ).resolves.toEqual(uploadResult);
    await expect(
      controller.download({id: 7} as never, 31, response as never),
    ).resolves.toEqual(response);
    await expect(
      controller.preview({id: 7} as never, 31, response as never),
    ).resolves.toEqual(response);

    expect(authorization.assertWorkspaceMember).toHaveBeenCalledWith(11, 7);
    expect(repository.upload).toHaveBeenCalledWith(request, response);
    expect(repository.download).toHaveBeenCalledWith(31, response);
    expect(repository.preview).toHaveBeenCalledWith(31, response);
  });
});
