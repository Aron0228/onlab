import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import UiAlert from 'client/components/ui/alert';
import { inject as service } from '@ember/service';
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
  destroyMessage?: () => void;
};

export default class FlashMessages extends Component<FlashMessagesSignature> {
  @service declare flashMessages: FlashMessagesServiceLike;

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

  <template>
    <div class="ui-alert__container">
      {{#each this.flashMessages.queue as |flash|}}
        <UiAlert
          @message={{flash.message}}
          @type={{this.flashType flash.type}}
          @onClose={{fn this.dismissFlash flash}}
        />
      {{/each}}
    </div>
  </template>
}
