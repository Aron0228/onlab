import Component from '@glimmer/component';
import UiIcon from 'client/components/ui/icon';
import { on } from '@ember/modifier';
import { or } from 'ember-truth-helpers';
import { action } from '@ember/object';
import { LinkTo } from '@ember/routing';

interface UiIconButtonSignature {
  iconName: string;
  iconVariant?: 'normal' | 'primary' | 'info' | 'error' | 'warning' | 'success';
  iconSize?: 'sm' | 'md' | 'lg';
  onClick?: (event?: Event) => void;
  route?: string;
}

export default class UiIconButton extends Component<UiIconButtonSignature> {
  get iconVariant() {
    return this.args.iconVariant ?? 'normal';
  }

  @action onClick(event: Event) {
    if (this.args.onClick) this.args.onClick(event);

    return;
  }

  <template>
    {{#if @route}}
      <LinkTo
        @route={{@route}}
        class="ui-icon-button --{{this.iconVariant}} --route-action"
      >
        <UiIcon
          @name={{@iconName}}
          @size={{or @iconSize "sm"}}
          @variant={{this.iconVariant}}
        />
      </LinkTo>
    {{else}}
      <button
        type="button"
        class="ui-icon-button --{{this.iconVariant}}"
        {{on "click" this.onClick}}
      >
        <UiIcon
          @name={{@iconName}}
          @size={{or @iconSize "sm"}}
          @variant={{this.iconVariant}}
        />
      </button>
    {{/if}}
  </template>
}
