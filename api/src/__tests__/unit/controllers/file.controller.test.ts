import {beforeEach, describe, expect, it, vi} from 'vitest';

import {File} from '../../../models';
import {FileController} from '../../../controllers/system/file.controller';
import {createCrudRepositoryMock, describeCrudController} from './test-helpers';

describe('FileController (unit)', () => {
  describeCrudController({
    controllerName: 'FileController',
    createController: repository => new FileController(repository as never),
    id: 31,
    filter: {where: {workspaceId: 11}},
    where: {workspaceId: 11},
    entityFactory: () =>
      new File({
        id: 31,
        workspaceId: 11,
        originalName: 'avatar.png',
        mimeType: 'image/png',
        size: 2048,
        path: '/uploads/avatar.png',
      }),
    createPayloadFactory: () => ({
      workspaceId: 11,
      originalName: 'avatar.png',
      mimeType: 'image/png',
      size: 2048,
      path: '/uploads/avatar.png',
    }),
    updatePayloadFactory: () => ({
      originalName: 'avatar-updated.png',
    }),
    relationName: 'workspace',
    relationValueFactory: () => ({
      id: 11,
      name: 'Demo Workspace',
    }),
  });

  let repository: ReturnType<typeof createCrudRepositoryMock> & {
    upload: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
    preview: ReturnType<typeof vi.fn>;
  };
  let controller: FileController;

  beforeEach(() => {
    repository = {
      ...createCrudRepositoryMock(),
      upload: vi.fn(),
      download: vi.fn(),
      preview: vi.fn(),
    };
    controller = new FileController(repository as never);
  });

  it('uploads files', async () => {
    const request = {file: {originalname: 'avatar.png'}};
    const response = {status: vi.fn()};
    const uploadResult = {id: 31, url: '/files/31/preview'};
    repository.upload.mockResolvedValue(uploadResult);

    await expect(
      controller.upload(request as never, response as never),
    ).resolves.toEqual(uploadResult);
    expect(repository.upload).toHaveBeenCalledWith(request, response);
  });

  it('downloads files by id', async () => {
    const response = {download: vi.fn()};
    repository.download.mockResolvedValue(response);

    await expect(controller.download(31, response as never)).resolves.toEqual(
      response,
    );
    expect(repository.download).toHaveBeenCalledWith(31, response);
  });

  it('previews files by id', async () => {
    const response = {sendFile: vi.fn()};
    repository.preview.mockResolvedValue(response);

    await expect(controller.preview(31, response as never)).resolves.toEqual(
      response,
    );
    expect(repository.preview).toHaveBeenCalledWith(31, response);
  });
});
