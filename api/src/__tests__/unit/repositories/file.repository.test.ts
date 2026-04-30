import {juggler} from '@loopback/repository';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const fsMock = vi.hoisted(() => ({
  createReadStream: vi.fn(),
  statSync: vi.fn(),
  unlink: vi.fn(),
}));

const multerMock = vi.hoisted(() => ({
  multer: vi.fn(),
}));

vi.mock('fs', () => ({
  default: fsMock,
}));

vi.mock('multer', () => ({
  default: multerMock.multer,
}));

import {File} from '../../../models';
import {FileRepository} from '../../../repositories';

describe('FileRepository upload and preview (unit)', () => {
  let repository: FileRepository;
  let uploadMiddleware: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    uploadMiddleware = vi.fn((_request, _response, callback) => callback());
    multerMock.multer.mockReturnValue({
      array: vi.fn(() => uploadMiddleware),
    });
    fsMock.statSync.mockReturnValue({size: 4096});
    fsMock.unlink.mockImplementation((_path, callback) => callback());
    fsMock.createReadStream.mockReturnValue({pipe: vi.fn()});

    repository = new FileRepository(
      new juggler.DataSource({name: 'db', connector: 'memory'}) as never,
      async () => ({}) as never,
    );
  });

  it('uploads one file and stores its metadata with a workspace id', async () => {
    const create = vi.spyOn(repository, 'create').mockResolvedValue({
      id: 90,
      originalName: 'avatar.png',
      mimeType: 'image/png',
      size: 4096,
      path: 'uploads/file',
      workspaceId: 3,
    } as never);
    const request = {
      query: {workspaceId: '3'},
      files: [
        {
          originalname: 'avatar.png',
          mimetype: 'image/png',
          path: 'uploads/file',
        },
      ],
    };
    const response = {};

    await expect(
      repository.upload(request as never, response as never),
    ).resolves.toEqual({
      id: 90,
      originalName: 'avatar.png',
      mimeType: 'image/png',
      size: 4096,
      path: 'uploads/file',
      workspaceId: 3,
    });

    expect(multerMock.multer).toHaveBeenCalledWith({dest: 'uploads/'});
    expect(uploadMiddleware).toHaveBeenCalledWith(
      request,
      response,
      expect.any(Function),
    );
    expect(create).toHaveBeenCalledWith({
      originalName: 'avatar.png',
      mimeType: 'image/png',
      size: 4096,
      path: 'uploads/file',
      workspaceId: 3,
    });
  });

  it('uploads multiple files without a workspace id when the query is absent', async () => {
    vi.spyOn(repository, 'create').mockImplementation(data => {
      const fileData = data as Partial<File> & {path: string};

      return Promise.resolve(
        new File({id: fileData.path === 'uploads/a' ? 1 : 2, ...fileData}),
      );
    });
    const request = {
      files: [
        {originalname: 'a.txt', mimetype: 'text/plain', path: 'uploads/a'},
        {originalname: 'b.txt', mimetype: 'text/plain', path: 'uploads/b'},
      ],
    };

    await expect(
      repository.upload(request as never, {} as never),
    ).resolves.toEqual([
      {
        id: 1,
        originalName: 'a.txt',
        mimeType: 'text/plain',
        size: 4096,
        path: 'uploads/a',
      },
      {
        id: 2,
        originalName: 'b.txt',
        mimeType: 'text/plain',
        size: 4096,
        path: 'uploads/b',
      },
    ]);
  });

  it('cleans up failed uploads and returns per-file errors', async () => {
    fsMock.statSync.mockImplementation(() => {
      throw new Error('disk read failed');
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const request = {
      query: {workspaceId: '3'},
      files: [
        {
          originalname: 'avatar.png',
          mimetype: 'image/png',
          path: 'uploads/file',
        },
      ],
    };

    await expect(
      repository.upload(request as never, {} as never),
    ).resolves.toEqual({
      originalName: 'avatar.png',
      error: 'disk read failed',
    });

    expect(fsMock.unlink).toHaveBeenCalledWith(
      'uploads/file',
      expect.any(Function),
    );
    consoleError.mockRestore();
  });

  it('streams video preview ranges with partial content headers', async () => {
    const pipe = vi.fn();
    fsMock.statSync.mockReturnValue({size: 100});
    fsMock.createReadStream.mockReturnValue({pipe});
    vi.spyOn(repository, 'findById').mockResolvedValue({
      id: 90,
      originalName: 'demo.mp4',
      mimeType: 'video/mp4',
      size: 100,
      path: 'uploads/demo.mp4',
    } as never);
    const response = {
      req: {headers: {range: 'bytes=10-19'}},
      writeHead: vi.fn(),
    };

    await expect(repository.preview(90, response as never)).resolves.toBe(
      response,
    );

    expect(response.writeHead).toHaveBeenCalledWith(206, {
      'Content-Range': 'bytes 10-19/100',
      'Accept-Ranges': 'bytes',
      'Content-Length': 10,
      'Content-Type': 'video/mp4',
    });
    expect(fsMock.createReadStream).toHaveBeenCalledWith(
      expect.stringContaining('uploads/demo.mp4'),
      {start: 10, end: 19},
    );
    expect(pipe).toHaveBeenCalledWith(response);
  });

  it('uses the file size as the range end when video range end is omitted', async () => {
    fsMock.statSync.mockReturnValue({size: 100});
    vi.spyOn(repository, 'findById').mockResolvedValue({
      id: 90,
      originalName: 'demo.mp4',
      mimeType: 'video/mp4',
      size: 100,
      path: 'uploads/demo.mp4',
    } as never);
    const response = {
      req: {headers: {range: 'bytes=90-'}},
      writeHead: vi.fn(),
    };

    await repository.preview(90, response as never);

    expect(response.writeHead).toHaveBeenCalledWith(
      206,
      expect.objectContaining({
        'Content-Range': 'bytes 90-99/100',
        'Content-Length': 10,
      }),
    );
  });

  it('sends non-ranged previews with the stored content type', async () => {
    vi.spyOn(repository, 'findById').mockResolvedValue({
      id: 91,
      originalName: 'mockup.png',
      mimeType: 'image/png',
      size: 4096,
      path: 'uploads/mockup.png',
    } as never);
    const response = {
      setHeader: vi.fn(),
      sendFile: vi.fn(),
    };

    await expect(repository.preview(91, response as never)).resolves.toBe(
      response,
    );

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'image/png',
    );
    expect(response.sendFile).toHaveBeenCalledWith(
      expect.stringContaining('uploads/mockup.png'),
    );
  });

  it('downloads files with their stored filename and content type', async () => {
    vi.spyOn(repository, 'findById').mockResolvedValue({
      id: 92,
      originalName: 'report.pdf',
      mimeType: 'application/pdf',
      size: 8192,
      path: 'uploads/report.pdf',
    } as never);
    const response = {
      setHeader: vi.fn(),
      download: vi.fn(),
    };

    await expect(repository.download(92, response as never)).resolves.toBe(
      response,
    );

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(response.download).toHaveBeenCalledWith(
      expect.stringContaining('uploads/report.pdf'),
      'report.pdf',
    );
  });

  it('rejects downloads for missing files', async () => {
    vi.spyOn(repository, 'findById').mockResolvedValue(undefined as never);

    await expect(repository.download(404, {} as never)).rejects.toThrowError(
      'File not found!',
    );
  });
});
