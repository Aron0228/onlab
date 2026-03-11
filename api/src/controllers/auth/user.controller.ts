import {repository} from '@loopback/repository';
import {UserRepository} from '../../repositories';
import {createBaseCrudController} from '../base-crud.controller';
import {User, UserRelations} from '../../models';

const UserBaseCrudController = createBaseCrudController<
  User,
  typeof User.prototype.id,
  UserRelations
>('/users');

export class UserController extends UserBaseCrudController {
  constructor(
    @repository(UserRepository) private userRepository: UserRepository,
  ) {
    super(userRepository);
  }
}
