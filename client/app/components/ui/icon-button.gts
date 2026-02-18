import Component from '@glimmer/component';
import UiIcon from 'client/components/ui/icon';
import { on } from '@ember/modifier';
import { action } from '@ember/object';

interface UiIconButtonSignature {
  iconName: string;
  iconVariant?: 'normal' | 'primary' | 'info' | 'error' | 'warning' | 'success';
  onClick?: (event?: Event) => void;
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
    <button
      type="button"
      class="ui-icon-button --{{this.iconVariant}}"
      {{on "click" this.onClick}}
    >
      <UiIcon @name={{@iconName}} @size="sm" @variant={{this.iconVariant}} />
    </button>
  </template>
}
