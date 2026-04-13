import Component from '@glimmer/component';
import { registerDestructor } from '@ember/destroyable';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { eq, and } from 'ember-truth-helpers';
import { fn } from '@ember/helper';
import type Owner from '@ember/owner';
import UiIcon from 'client/components/ui/icon';
import UiIconButton from 'client/components/ui/icon-button';
import UiInput from 'client/components/ui/input';

export type DropdownOption = {
  name?: string;
  fullName?: string;
  flag?: string;
  tKey?: string;
  code?: string;
  momentLocale?: 'hu' | 'en';
  id?: string | number | null;
};

export interface UiDropdownSignature {
  Args: {
    options: DropdownOption[];
    selected?: DropdownOption | null;
    onChange?: (selected: DropdownOption | null) => void;
    disabled?: boolean;
    placeholder?: string;
    onSearch?: (searchTerm: string) => void;
    allowClear?: boolean;
  };
  Blocks: {
    default: [DropdownOption];
    selected: [DropdownOption];
    option: [DropdownOption];
  };
  Element: HTMLDivElement;
}

export default class UiDropdown extends Component<UiDropdownSignature> {
  @tracked isOpen = false;
  @tracked selected: DropdownOption | null = this.args.selected ?? null;

  handleOutsideClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const isInside = document
      .querySelector('.ui-dropdown__dropdown__search')
      ?.contains(target);

    if (!isInside && this.isOpen) {
      this.isOpen = false;
    }
  };

  constructor(owner: Owner, args: UiDropdownSignature['Args']) {
    super(owner, args);

    document.addEventListener('click', this.handleOutsideClick);

    registerDestructor(this, () => {
      document.removeEventListener('click', this.handleOutsideClick);
    });
  }

  @action toggleDropdown(event: Event) {
    if (this.args.disabled) return;

    event.stopPropagation();
    this.isOpen = !this.isOpen;
  }

  @action selectOption(option: DropdownOption) {
    this.selected = option;

    if (this.args.onChange) this.args.onChange(option);
  }

  @action onClear(event?: Event) {
    event?.stopPropagation();

    this.selected = null;
    this.args.onChange?.(null);
  }

  <template>
    <div class="ui-dropdown {{if @disabled '--disabled'}}" ...attributes>
      <button
        type="button"
        class="ui-dropdown__trigger"
        {{on "click" this.toggleDropdown}}
      >
        <div class="layout-horizontal --gap-md --flex-grow">
          {{#if this.selected}}
            <span class="ui-dropdown__option-text">
              {{#if (has-block "selected")}}
                {{yield this.selected to="selected"}}
              {{else if (has-block)}}
                {{yield this.selected}}
              {{else}}
                {{this.selected.name}}
              {{/if}}
            </span>
          {{else}}
            <span
              class="ui-dropdown__trigger__placeholder"
            >{{@placeholder}}</span>
          {{/if}}

          {{#if (and this.selected @allowClear)}}
            <UiIconButton
              @iconName="circle-x"
              @onClick={{this.onClear}}
              @iconVariant="primary"
            />
          {{/if}}
          <UiIcon
            @name="chevron-up"
            @size="sm"
            class="ui-dropdown__trigger__arrow {{if this.isOpen '--is-open'}}"
          />
        </div>
      </button>

      {{#if this.isOpen}}
        <div class="ui-dropdown__dropdown">
          {{#if @onSearch}}
            <div class="ui-dropdown__dropdown__search">
              <UiInput @onInput={{@onSearch}} />
              <hr class="separator --horizontal" />
            </div>
          {{/if}}
          {{#each @options as |option|}}
            <button
              type="button"
              class="ui-dropdown__dropdown__option
                {{if (eq option this.selected) '--is-active'}}"
              {{on "click" (fn this.selectOption option)}}
            >
              <span class="ui-dropdown__option-text">
                {{#if (has-block "option")}}
                  {{yield option to="option"}}
                {{else if (has-block)}}
                  {{yield option}}
                {{else}}
                  {{option.name}}
                {{/if}}
              </span>

              {{#if (eq option this.selected)}}
                <UiIcon @name="circle-check" @size="sm" @variant="primary" />
              {{/if}}
            </button>
          {{/each}}
        </div>
      {{/if}}
    </div>
  </template>
}
