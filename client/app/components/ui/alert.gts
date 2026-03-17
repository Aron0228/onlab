import Component from '@glimmer/component';
import UiIcon from 'client/components/ui/icon';
import UiIconButton from 'client/components/ui/icon-button';

export interface UiAlertSignature {
  Args: {
    message: string;
    type?: 'info' | 'success' | 'warning' | 'alert';
    onClose: () => void;
  };
  Element: HtmlDivElement;
}

const ICONS = [
  { name: 'info-circle', variant: 'info', alertType: 'info' },
  { name: 'circle-check', variant: 'success', alertType: 'success' },
  { name: 'alert-triangle', variant: 'warning', alertType: 'warning' },
  { name: 'circle-x', variant: 'error', alertType: 'alert' },
];

export default class UiAlert extends Component<UiAlertSignature> {
  get type() {
    return this.args.type ?? 'info';
  }

  get icon() {
    const type = this.args.type ?? 'info';

    return ICONS.find((icon) => icon.alertType === type);
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
