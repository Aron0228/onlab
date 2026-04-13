import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import svgJar from 'ember-svg-jar/helpers/svg-jar';
import { or } from 'ember-truth-helpers';

interface UiAriaTabSignature {
  Args: {
    tabId?: string;
    currentTab?: string;
    text?: string;
    iconName?: string;
    count?: string | number;
    id?: string;
    controls?: string;
    isActive?: boolean;
    disabled?: boolean;
    type?: 'button' | 'submit';
    onSelect?: (tabId: string, event?: Event) => void;
    onClick?: (event?: Event) => void;
  };
  Blocks: {
    default: [];
  };
  Element: HTMLButtonElement;
}

export default class UiAriaTab extends Component<UiAriaTabSignature> {
  get isActive(): boolean {
    if (this.args.isActive != null) {
      return this.args.isActive;
    }

    return (
      this.args.tabId != null &&
      this.args.currentTab != null &&
      this.args.tabId === this.args.currentTab
    );
  }

  get tabClass(): string {
    return `ui-aria-tab${this.isActive ? ' --active' : ''}`;
  }

  get iconName(): string | undefined {
    if (this.args.iconName == null) {
      return undefined;
    }

    return `outline-${this.args.iconName}`;
  }

  handleClick = (event: Event) => {
    if (this.args.disabled) {
      event.preventDefault();
      return;
    }

    if (this.args.onSelect && this.args.tabId) {
      this.args.onSelect(this.args.tabId, event);
    }

    this.args.onClick?.(event);
  };

  <template>
    <button
      type={{or @type "button"}}
      class={{this.tabClass}}
      role="tab"
      id={{@id}}
      aria-controls={{@controls}}
      aria-selected={{if this.isActive "true" "false"}}
      disabled={{@disabled}}
      {{on "click" this.handleClick}}
      ...attributes
    >
      {{#if this.iconName}}
        <span
          class="ui-icon-wrapper --size-sm --stroke-width-md --variant-normal ui-aria-tab__icon"
          aria-hidden="true"
          role="presentation"
        >
          {{svgJar this.iconName}}
        </span>
      {{/if}}

      {{#if (has-block)}}
        <span class="ui-aria-tab__label">{{yield}}</span>
      {{else if @text}}
        <span class="ui-aria-tab__label">{{@text}}</span>
      {{/if}}

      {{#if @count}}
        <span class="ui-aria-tab__count">{{@count}}</span>
      {{/if}}
    </button>
  </template>
}
