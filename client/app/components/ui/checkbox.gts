import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { action } from '@ember/object';
import { guidFor } from '@ember/object/internals';
import { or } from 'ember-truth-helpers';

export interface UiCheckboxSignature {
  Args: {
    checked?: boolean;
    disabled?: boolean;
    id?: string;
    label?: string;
    name?: string;
    value?: string;
    onChange?: (checked: boolean, event: Event) => void;
  };
  Blocks: {
    default: [];
  };
  Element: HTMLLabelElement;
}

export default class UiCheckbox extends Component<UiCheckboxSignature> {
  get id() {
    return this.args.id ?? guidFor(this);
  }

  @action
  handleChange(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;

    this.args.onChange?.(checked, event);
  }

  <template>
    <label class="ui-checkbox {{if @disabled '--disabled'}}" ...attributes>
      <input
        id={{this.id}}
        type="checkbox"
        name={{@name}}
        value={{@value}}
        checked={{@checked}}
        disabled={{@disabled}}
        class="ui-checkbox__input"
        {{on "change" this.handleChange}}
      />

      <span class="ui-checkbox__control" aria-hidden="true"></span>

      {{#if (or (has-block) @label)}}
        <span class="ui-checkbox__label">
          {{#if (has-block)}}
            {{yield}}
          {{else}}
            {{@label}}
          {{/if}}
        </span>
      {{/if}}
    </label>
  </template>
}
