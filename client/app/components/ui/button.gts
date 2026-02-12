import Component from '@glimmer/component';
import { or } from 'ember-truth-helpers';
import UiIcon from 'client/components/ui/icon';

interface UiButtonSignature {
  Args: {
    text?: string;
    type?: 'button' | 'submit';
    hierarchy?: 'primary' | 'secondary' | 'tertiary';
    iconLeft?: string;
    loading?: boolean;
    disabled?: boolean;
  };
  Element: HTMLButtonElement;
}

export default class UiButton extends Component<UiButtonSignature> {
  get hierarchyClass() {
    return `--hierarchy-${this.args.hierarchy ?? 'primary'}`;
  }

  get shouldRenderIconInTextBlock() {
    return this.args.iconLeft;
  }

  <template>
    <button
      type={{or @type "button"}}
      class="btn {{this.hierarchyClass}} {{if @loading 'is-loading'}}"
      onClick={{@onClick}}
      disabled={{or @disabled @loading}}
      ...attributes
    >
      {{#if @text}}
        <span class="btn__text">
          {{@text}}
        </span>
      {{/if}}

      {{#if @iconLeft}}
        <span class="btn__text">
          <UiIcon @name={{@iconLeft}} />
        </span>
      {{/if}}
    </button>
  </template>
}
