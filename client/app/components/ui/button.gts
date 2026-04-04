import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { or } from 'ember-truth-helpers';
import UiIcon from 'client/components/ui/icon';

interface UiButtonSignature {
  Args: {
    text?: string;
    type?: 'button' | 'submit';
    hierarchy?: 'primary' | 'secondary' | 'tertiary';
    iconRight?: string;
    iconLeft?: string;
    loading?: boolean;
    disabled?: boolean;
    onClick?: (event?: Event) => void;
  };
  Element: HTMLButtonElement;
}

export default class UiButton extends Component<UiButtonSignature> {
  get hierarchyClass() {
    return `--hierarchy-${this.args.hierarchy ?? 'primary'}`;
  }

  handleClick = (event: PointerEvent) => {
    this.args.onClick?.(event);
  };

  get shouldRenderIconInTextBlock() {
    return this.args.iconLeft;
  }

  <template>
    <button
      type={{or @type "button"}}
      class="btn {{this.hierarchyClass}} {{if @loading 'is-loading'}}"
      {{on "click" this.handleClick}}
      disabled={{or @disabled @loading}}
      ...attributes
    >
      <div class="layout-horizontal --gap-sm">
        {{#if @iconLeft}}
          <span class="btn__text">
            <UiIcon @name={{@iconLeft}} />
          </span>
        {{/if}}

        {{#if @text}}
          <span class="btn__text">
            {{@text}}
          </span>
        {{/if}}

        {{#if @iconRight}}
          <span class="btn__text">
            <UiIcon @name={{@iconRight}} />
          </span>
        {{/if}}
      </div>
    </button>
  </template>
}
