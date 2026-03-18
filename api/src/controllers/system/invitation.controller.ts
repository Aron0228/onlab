import {repository} from '@loopback/repository';
import {Invitation, InvitationRelations} from '../../models';
import {InvitationRepository} from '../../repositories';
import {createBaseCrudController} from '../base-crud.controller';
import {post, requestBody} from '@loopback/rest';

const InvitationBaseCrudController = createBaseCrudController<
  Invitation,
  typeof Invitation.prototype.id,
  InvitationRelations
>('invitations');

export class InvitationController extends InvitationBaseCrudController {
  constructor(
    @repository(InvitationRepository)
    private invitationRepository: InvitationRepository,
  ) {
    super(invitationRepository);
  }

  @post('/invitations/accept')
  public async accept(@requestBody() body: {invitationId: number}) {
    return await this.invitationRepository.accept(body.invitationId);
  }
}
