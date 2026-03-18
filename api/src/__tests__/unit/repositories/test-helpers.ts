import {juggler} from '@loopback/repository';
import {securityId, UserProfile} from '@loopback/security';

import {
  FileRepository,
  InvitationRepository,
  UserRepository,
  WorkspaceMemberRepository,
  WorkspaceRepository,
} from '../../../repositories';

export const createMemoryDataSource = () =>
  new juggler.DataSource({
    name: 'test',
    connector: 'memory',
  });

export const givenCurrentUser = (id = 1): UserProfile => ({
  id,
  [securityId]: String(id),
});

export const buildSystemRepositories = (
  dataSource: juggler.DataSource,
  currentUser: UserProfile | undefined = givenCurrentUser(),
) => {
  const userRepository = new UserRepository(dataSource as never);
  const refs = {} as {
    workspaceRepository: WorkspaceRepository;
    workspaceMemberRepository: WorkspaceMemberRepository;
    fileRepository: FileRepository;
    invitationRepository: InvitationRepository;
  };
  const workspaceRepository = new WorkspaceRepository(
    dataSource as never,
    async () => userRepository,
    async () => refs.fileRepository,
    async () => refs.invitationRepository,
  );
  const workspaceMemberRepository = new WorkspaceMemberRepository(
    dataSource as never,
    async () => userRepository,
    async () => refs.workspaceRepository,
  );
  const fileRepository = new FileRepository(
    dataSource as never,
    async () => refs.workspaceRepository,
  );
  const invitationRepository = new InvitationRepository(
    dataSource as never,
    async () => refs.workspaceRepository,
    async () => refs.workspaceMemberRepository,
    async () => currentUser,
  );

  refs.workspaceRepository = workspaceRepository;
  refs.workspaceMemberRepository = workspaceMemberRepository;
  refs.fileRepository = fileRepository;
  refs.invitationRepository = invitationRepository;

  return {
    userRepository,
    workspaceRepository,
    workspaceMemberRepository,
    fileRepository,
    invitationRepository,
  };
};
