import {repository} from '@loopback/repository';
import {Invitation, InvitationRelations} from '../../models';
import {InvitationRepository} from '../../repositories';
import {createBaseCrudController} from '../base-crud.controller';

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
}
