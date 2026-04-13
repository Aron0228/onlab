import {repository} from '@loopback/repository';
import {UserExpertiseAssoc, UserExpertiseAssocRelations} from '../../models';
import {UserExpertiseAssocRepository} from '../../repositories';
import {createBaseCrudController} from '../base-crud.controller';

const UserExpertiseAssocBaseCrudController = createBaseCrudController<
  UserExpertiseAssoc,
  typeof UserExpertiseAssoc.prototype.id,
  UserExpertiseAssocRelations
>('userExpertiseAssocs');

export class UserExpertiseAssocController extends UserExpertiseAssocBaseCrudController {
  constructor(
    @repository(UserExpertiseAssocRepository)
    private userExpertiseAssocRepository: UserExpertiseAssocRepository,
  ) {
    super(userExpertiseAssocRepository);
  }
}
