import Component from '@glimmer/component';
import { action } from '@ember/object';
import { on } from '@ember/modifier';
import UiIcon from 'client/components/ui/icon';
import UiIconButton from 'client/components/ui/icon-button';
import UiButton from 'client/components/ui/button';

export interface UiAlertSignature {
  Args: {
    message: string;
    title?: string;
    type?: 'info' | 'success' | 'warning' | 'alert';
    onClose: () => void;
    onActivate?: () => void;
    actionText?: string;
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

  @action activate(): void {
    this.args.onActivate?.();
  }

  @action close(event?: Event): void {
    event?.stopPropagation();
    this.args.onClose();
  }

  @action activateAction(event?: Event): void {
    event?.stopPropagation();
    this.args.onActivate?.();
  }

  <template>
    <div
      class="ui-alert --type-{{this.type}} {{if @onActivate '--interactive'}}"
      role={{if @onActivate "button" "alert"}}
      tabindex={{if @onActivate "0"}}
      {{on "click" this.activate}}
    >
      <div class="ui-alert__icon">
        <UiIcon @name={{this.icon.name}} @variant={{this.icon.variant}} />
      </div>

      <div class="ui-alert__content">
        {{#if @title}}
          <strong class="ui-alert__title">{{@title}}</strong>
        {{/if}}
        <div class="ui-alert__message">
          {{@message}}
        </div>
      </div>

      <div class="ui-alert__controls">
        {{#if @actionText}}
          <UiButton
            class="ui-alert__action"
            @text={{@actionText}}
            @hierarchy="secondary"
            @iconRight="arrow-right"
            @onClick={{this.activateAction}}
          />
        {{/if}}

        <UiIconButton
          class="ui-alert__close"
          @iconName="x"
          @iconVariant={{this.icon.variant}}
          @onClick={{this.close}}
        />
      </div>
    </div>
  </template>
}
