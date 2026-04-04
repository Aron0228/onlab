import Component from '@glimmer/component';
import UiIcon from 'client/components/ui/icon';
import UiIconButton from 'client/components/ui/icon-button';

export interface UiAlertSignature {
  Args: {
    message: string;
    type?: 'info' | 'success' | 'warning' | 'alert';
    onClose: () => void;
  };
  Element: HTMLDivElement;
}

const ICONS = [
  { name: 'info-circle', variant: 'info', alertType: 'info' },
  { name: 'circle-check', variant: 'success', alertType: 'success' },
  { name: 'alert-triangle', variant: 'warning', alertType: 'warning' },
  { name: 'circle-x', variant: 'error', alertType: 'alert' },
] as const satisfies Array<{
  name: string;
  variant: 'normal' | 'primary' | 'info' | 'error' | 'warning' | 'success';
  alertType: NonNullable<UiAlertSignature['Args']['type']>;
}>;

export default class UiAlert extends Component<UiAlertSignature> {
  get type(): NonNullable<UiAlertSignature['Args']['type']> {
    return this.args.type ?? 'info';
  }

  get icon() {
    return ICONS.find((icon) => icon.alertType === this.type) ?? ICONS[0];
  }

  <template>
    <div class="ui-alert --type-{{this.type}}" role="alert">
      <div class="ui-alert__icon">
        <UiIcon @name={{this.icon.name}} @variant={{this.icon.variant}} />
      </div>

      <div class="ui-alert__message">
        {{@message}}
      </div>

      <div class="ui-alert__close">
        <UiIconButton
          @iconName="x"
          @iconVariant={{this.icon.variant}}
          @onClick={{@onClose}}
        />
      </div>
    </div>
  </template>
}
