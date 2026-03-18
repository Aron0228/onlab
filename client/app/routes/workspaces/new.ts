import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import type WorkspaceModel from 'client/models/workspace';
import type SessionAccountService from 'client/services/session-account';

type StoreLike = {
  createRecord(
    modelName: 'workspace',
    data: { ownerId?: number }
  ): WorkspaceModel;
};

export default class WorkspacesNewRoute extends Route {
  @service declare store: StoreLike;
  @service declare sessionAccount: SessionAccountService;

  model(): WorkspaceModel {
    return this.store.createRecord('workspace', {
      ownerId: this.sessionAccount.id,
    });
  }
}
