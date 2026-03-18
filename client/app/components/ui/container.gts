import Component from '@glimmer/component';
import { or } from 'ember-truth-helpers';

interface UiContainerSignature {
  Args: {
    title?: string;
    bordered?: boolean;
    variant?: 'default' | 'primary' | 'info' | 'warning' | 'error';
  };
  Element: HtmlDivElement;
}

export default class UiContainer extends Component<UiContainerSignature> {
  get containerClass() {
    const bordered = this.args.bordered ?? false;
    const variant = this.args.variant ?? 'default';

    return `ui-container${bordered ? ' --bordered' : ''} --${variant}`;
  }

  <template>
    <div class={{this.containerClass}} ...attributes>
      {{#if (or @title (has-block "header"))}}
        <div class="ui-container__header">
          {{#if (has-block "header")}}
            {{yield to="header"}}
          {{else}}
            <h3 class="ui-container__header__title">{{@title}}</h3>
          {{/if}}
        </div>
      {{/if}}
      <div class="ui-container__body">
        {{yield}}
      </div>
    </div>
  </template>
}
