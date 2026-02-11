import Component from '@glimmer/component';
import svgJar from 'ember-svg-jar/helpers/svg-jar';

interface UiIconSignature {
  Args: {
    name: string;
    size?: 'sm' | 'md' | 'lg';
    strokeWidth?: 'sm' | 'md' | 'lg';
    filled?: boolean;
    variant?: 'normal' | 'primary' | 'error' | 'warning' | 'success';
    custom?: boolean; // For added (non node_module) svgs this should be true
  };
  Element: SVGElement;
}

export default class UiIcon extends Component<UiIconSignature> {
  get size() {
    return this.args.size ?? 'md';
  }

  get strokeWidth() {
    return this.args.strokeWidth ?? 'md';
  }

  get name() {
    const name = this.args.name;

    if (this.args.custom) return name;

    const type = this.args.filled ? 'filled' : 'outline';

    return `${type}-${name}`;
  }

  get variant() {
    return this.args.variant ?? 'normal';
  }

  <template>
    <span
      class="ui-icon-wrapper --size-{{this.size}}
        --stroke-width-{{this.strokeWidth}}
        --variant-{{this.variant}}"
      ...attributes
    >
      {{#if @custom}}
        {{svgJar this.name stroke="none"}}
      {{else}}
        {{svgJar this.name}}
      {{/if}}
    </span>
  </template>
}
