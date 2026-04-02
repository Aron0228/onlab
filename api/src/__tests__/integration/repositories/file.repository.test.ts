import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {RestApi} from '../../..';
import {File} from '../../../models';
import {
  FileRepository,
  UserRepository,
  WorkspaceRepository,
} from '../../../repositories';
import {
  createTestUser,
  createTestWorkspace,
  getTestRepository,
  resetTestDataSource,
  setupRepositoryTestApp,
  teardownRepositoryTestApp,
} from './test-helpers';

vi.mock('multer', () => ({
  default: vi.fn(() => ({
    array: vi.fn(
      () =>
        (
          _request: object,
          _response: object,
          callback: (error?: Error | null) => void,
        ) => {
          callback(null);
        },
    ),
  })),
}));

vi.mock('fs', () => ({
  default: {
    statSync: vi.fn(() => ({size: 123})),
    unlink: vi.fn((_: string, callback: (error: null) => void) =>
      callback(null),
    ),
  },
}));

describe('FileRepository (integration)', () => {
  let app: RestApi;
  let dataSource: Awaited<
    ReturnType<typeof setupRepositoryTestApp>
  >['dataSource'];
  let fileRepository: FileRepository;
  let userRepository: UserRepository;
  let workspaceRepository: WorkspaceRepository;
  let workspaceId: number;

  beforeAll(async () => {
    ({app, dataSource} = await setupRepositoryTestApp());
    fileRepository = await getTestRepository<FileRepository>(
      app,
      'FileRepository',
    );
    userRepository = await getTestRepository<UserRepository>(
      app,
      'UserRepository',
    );
    workspaceRepository = await getTestRepository<WorkspaceRepository>(
      app,
      'WorkspaceRepository',
    );
  });

  beforeEach(async () => {
    await resetTestDataSource(dataSource);
    const user = await createTestUser(userRepository);
    const workspace = await createTestWorkspace(workspaceRepository, user.id);
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await teardownRepositoryTestApp(app, dataSource);
  });

  const createFile = () =>
    fileRepository.create(
      new File({
        workspaceId,
        originalName: 'avatar.png',
        mimeType: 'image/png',
        size: 123,
        path: 'uploads/avatar.png',
      }),
    );

  it('creates files', async () => {
    await createFile();

    expect(await fileRepository.count()).toEqual({count: 1});
  });

  it('finds files by id', async () => {
    const created = await createFile();

    expect((await fileRepository.findById(created.id)).originalName).toBe(
      'avatar.png',
    );
  });

  it('updates files by id', async () => {
    const created = await createFile();

    await fileRepository.updateById(created.id, {originalName: 'profile.png'});
    expect((await fileRepository.findById(created.id)).originalName).toBe(
      'profile.png',
    );
  });

  it('deletes files by id', async () => {
    const created = await createFile();
    await fileRepository.deleteById(created.id);

    expect(await fileRepository.count()).toEqual({count: 0});
  });

  it('registers the workspace relation', () => {
    expect(fileRepository.inclusionResolvers.has('workspace')).toBe(true);
  });

  it('uploads files and stores their metadata', async () => {
    const repository = new FileRepository(dataSource as never, async () => {
      throw new Error('workspace accessor not used');
    });
    const createSpy = vi.spyOn(repository, 'create').mockResolvedValue(
      new File({
        id: 5,
        originalName: 'avatar.png',
        mimeType: 'image/png',
        size: 123,
        path: 'uploads/tmp-avatar',
      }),
    );
    const request = {
      files: [
        {
          path: 'uploads/tmp-avatar',
          originalname: 'avatar.png',
          mimetype: 'image/png',
        },
      ],
    };

    const result = await repository.upload(request as never, {} as never);

    expect(createSpy).toHaveBeenCalledWith({
      originalName: 'avatar.png',
      mimeType: 'image/png',
      size: 123,
      path: 'uploads/tmp-avatar',
    });
    expect(result).toBeInstanceOf(File);
  });

  it('streams previews with the correct content type', async () => {
    const repository = new FileRepository(dataSource as never, async () => {
      throw new Error('workspace accessor not used');
    });
    const response = {
      setHeader: vi.fn(),
      sendFile: vi.fn(),
    };

    vi.spyOn(repository, 'findById').mockResolvedValue(
      new File({
        id: 3,
        originalName: 'avatar.png',
        mimeType: 'image/png',
        size: 123,
        path: 'uploads/avatar.png',
      }),
    );

    await repository.preview(3, response as never);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'image/png',
    );
    expect(response.sendFile).toHaveBeenCalled();
  });

  it('downloads files as attachments', async () => {
    const repository = new FileRepository(dataSource as never, async () => {
      throw new Error('workspace accessor not used');
    });
    const response = {
      setHeader: vi.fn(),
      download: vi.fn(),
    };

    vi.spyOn(repository, 'findById').mockResolvedValue(
      new File({
        id: 4,
        originalName: 'report.pdf',
        mimeType: 'application/pdf',
        size: 456,
        path: 'uploads/report.pdf',
      }),
    );

    await repository.download(4, response as never);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(response.download).toHaveBeenCalled();
  });
});
