import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { modifier } from 'ember-modifier';

interface UiFooterActionsSignature {
  Args: Record<string, never>;
  Blocks: {
    default: [];
  };
  Element: HTMLDivElement;
}

export default class UiFooterActions extends Component<UiFooterActionsSignature> {
  @tracked left = 0;
  @tracked width = 0;

  syncLayout = modifier((element: HTMLDivElement) => {
    const updateLayout = () => {
      const { left, width } = element.getBoundingClientRect();

      this.left = left;
      this.width = width;
    };

    updateLayout();

    const resizeObserver = new ResizeObserver(() => {
      updateLayout();
    });

    resizeObserver.observe(element);
    window.addEventListener('resize', updateLayout);
    window.addEventListener('scroll', updateLayout, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateLayout);
      window.removeEventListener('scroll', updateLayout, true);
    };
  });

  get innerStyle(): string {
    return `left: ${this.left}px; width: ${this.width}px;`;
  }

  <template>
    <div class="ui-footer-actions" {{this.syncLayout}} ...attributes>
      <div class="ui-footer-actions__inner" style={{this.innerStyle}}>
        {{yield}}
      </div>
    </div>
  </template>
}
