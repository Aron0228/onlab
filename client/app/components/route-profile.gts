import Component from '@glimmer/component';
import UiAvatar from 'client/components/ui/avatar';
import { LinkTo } from '@ember/routing';
import { inject as service } from '@ember/service';
import { hash } from '@ember/helper';
import { or } from 'ember-truth-helpers';
import type UserModel from 'client/models/user';

export interface RouteProfileSignature {
  // The arguments accepted by the component
  Args: {
    routeBack: string;
  };
  // Any blocks yielded by the component
  Blocks: {
    default: [];
  };
  // The element to which `...attributes` is applied in the component template
  Element: null;
}

type SessionAccountServiceLike = {
  user: UserModel | null;
};

export default class RouteProfile extends Component<RouteProfileSignature> {
  @service declare sessionAccount: SessionAccountServiceLike;

  get user() {
    return this.sessionAccount.user;
  }

  <template>
    {{#if this.user}}
      <LinkTo
        @route="profile"
        @query={{hash routeBack=@routeBack}}
        class="route-profile-component"
      >
        <div class="route-profile-component__meta">
          <h3 class="route-profile-component__title margin-zero">
            {{or this.user.fullName this.user.username}}
          </h3>
          <span class="route-profile-component__subtitle">
            {{this.user.email}}
          </span>
        </div>

        <UiAvatar @model={{this.user}} @size="sm" />
      </LinkTo>
    {{/if}}
  </template>
}
