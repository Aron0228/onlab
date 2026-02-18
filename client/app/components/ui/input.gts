import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { guidFor } from '@ember/object/internals';
import { action } from '@ember/object';
import { or } from 'ember-truth-helpers';
import UiIconButton from 'client/components/ui/icon-button';

export interface UiInputSignature {
  Args: {
    value?: string;
    type?: 'text' | 'email' | 'password';
    placeholder?: string;
    id?: string;
    error?: boolean;
    disabled?: boolean;
    onInput?: (value: string) => void;
    rightIconButton?: {
      iconName: string;
      iconVariant?:
        | 'normal'
        | 'primary'
        | 'info'
        | 'error'
        | 'warning'
        | 'success';
      onClick?: (event?: Event) => void;
    };
  };
  Element: HTMLInputElement;
}

export default class UiInput extends Component<UiInputSignature> {
  get id() {
    return this.args.id ?? guidFor(this);
  }

  @action
  handleInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;

    this.args.onInput?.(value);
  }

  @action
  handleKeydown(event: KeyboardEvent) {
    if (
      event.key !== 'Enter' ||
      this.args.disabled ||
      !this.args.rightIconButton?.onClick
    ) {
      return;
    }

    const currentValue = (event.target as HTMLInputElement).value.trim();

    if (!currentValue) {
      return;
    }

    event.preventDefault();
    this.args.rightIconButton.onClick(event);
  }

  <template>
    {{#if @rightIconButton}}
      <div class="ui-input__with-right-icon">
        <input
          id={{this.id}}
          type={{or @type "text"}}
          value={{@value}}
          placeholder={{@placeholder}}
          disabled={{@disabled}}
          class="ui-input {{if @error '--error'}}"
          {{on "input" this.handleInput}}
          {{on "keydown" this.handleKeydown}}
          ...attributes
        />
        <div class="icon-button-container">
          <UiIconButton
            @iconName={{@rightIconButton.iconName}}
            @iconVariant={{@rightIconButton.iconVariant}}
            @onClick={{@rightIconButton.onClick}}
          />
        </div>
      </div>
    {{else}}
      <input
        id={{this.id}}
        type={{or @type "text"}}
        value={{@value}}
        placeholder={{@placeholder}}
        disabled={{@disabled}}
        class="ui-input {{if @error '--error'}}"
        {{on "input" this.handleInput}}
        {{on "keydown" this.handleKeydown}}
        ...attributes
      />
    {{/if}}
  </template>
}
