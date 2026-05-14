import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import UiAlert from 'client/components/ui/alert';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';
import type { EmptyArgs } from 'client/types/component';

export interface FlashMessagesSignature {
  // The arguments accepted by the component
  Args: EmptyArgs;
  // Any blocks yielded by the component
  Blocks: {
    default: [];
  };
  // The element to which `...attributes` is applied in the component template
  Element: null;
}

type FlashMessagesServiceLike = {
  queue: FlashMessageLike[];
  arrangedQueue: FlashMessageLike[];
};

type FlashMessageLike = {
  message: string;
  type?: string;
  _guid?: string;
  route?: string;
  models?: unknown[];
  actionText?: string;
  destroyMessage?: () => void;
};

export default class FlashMessages extends Component<FlashMessagesSignature> {
  @service declare flashMessages: FlashMessagesServiceLike;
  @service declare router: RouterService;

  flashType = (type?: string): 'info' | 'success' | 'warning' | 'alert' => {
    switch (type) {
      case 'success':
      case 'warning':
      case 'info':
        return type;
      case 'danger':
      case 'alert':
      default:
        return 'alert';
    }
  };

  dismissFlash = (flash: FlashMessageLike): void => {
    flash.destroyMessage?.();
  };

  activateFlash = (flash: FlashMessageLike): void => {
    if (!flash.route) return;

    flash.destroyMessage?.();
    void this.router.transitionTo(flash.route, ...(flash.models ?? []));
  };

  <template>
    <div class="ui-alert__container">
      {{#each this.flashMessages.queue as |flash|}}
        <UiAlert
          @message={{flash.message}}
          @type={{this.flashType flash.type}}
          @onClose={{fn this.dismissFlash flash}}
          @onActivate={{if flash.route (fn this.activateFlash flash)}}
          @actionText={{flash.actionText}}
        />
      {{/each}}
    </div>
  </template>
}
