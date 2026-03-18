import {Getter, inject} from '@loopback/core';
import {
  BelongsToAccessor,
  DefaultCrudRepository,
  IsolationLevel,
  repository,
} from '@loopback/repository';
import {PostgresDbDataSource} from '../../datasources';
import {Invitation, InvitationRelations, Workspace} from '../../models';
import {registerInclusionResolvers} from '../../utils';
import {WorkspaceRepository} from './workspace.repository';
import {WorkspaceMemberRepository} from './workspace-member.repository';
import {UserProfile} from '@loopback/security';
import {AuthenticationBindings} from '@loopback/authentication';
import {HttpErrors} from '@loopback/rest';
import {WORKSPACE_MEMBER_ROLE} from '../../constants';

export class InvitationRepository extends DefaultCrudRepository<
  Invitation,
  typeof Invitation.prototype.id,
  InvitationRelations
> {
  public readonly workspace: BelongsToAccessor<
    Workspace,
    typeof Invitation.prototype.id
  >;

  constructor(
    @inject('datasources.postgresDB') dataSource: PostgresDbDataSource,
    @repository.getter('WorkspaceRepository')
    private workspaceRepositoryGetter: Getter<WorkspaceRepository>,
    @repository.getter('WorkspaceMemberRepository')
    private workspaceMemberRepositoryGetter: Getter<WorkspaceMemberRepository>,

    @inject.getter(AuthenticationBindings.CURRENT_USER)
    private currentUserProfileGetter: Getter<UserProfile | undefined>,
  ) {
    super(Invitation, dataSource);

    this.workspace = this.createBelongsToAccessorFor(
      'workspace',
      this.workspaceRepositoryGetter,
    );

    registerInclusionResolvers(Invitation, this);
  }

  public async accept(invitationId: number) {
    const currentUser = await this.currentUserProfileGetter();

    if (!currentUser) {
      throw new HttpErrors.Unauthorized('Unauthorized');
    }

    const currentUserId = currentUser.id;

    const workspaceMemberRepository =
      await this.workspaceMemberRepositoryGetter();

    // Default serialization level is IsolationLevel.READ_COMMITTED
    const tx = await this.dataSource.beginTransaction({
      isolationLevel: IsolationLevel.READ_COMMITTED,
    });

    try {
      const invitation = await this.findById(invitationId, {
        fields: {
          id: true,
          workspaceId: true,
        },
      });

      await workspaceMemberRepository.create({
        userId: currentUserId,
        workspaceId: invitation.workspaceId,
        role: WORKSPACE_MEMBER_ROLE.MEMBER,
      });

      await this.deleteById(invitation.id);
    } catch (error) {
      tx.rollback();

      throw new HttpErrors.InternalServerError(error.message);
    }
  }
}
