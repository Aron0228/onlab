import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { hash } from '@ember/helper';
import UiAriaTab from 'client/components/ui/aria-tab';

interface UiAriaTabsRegistry {
  Tab: unknown;
  activeTab: string;
  selectTab: (tabId: string) => void;
}

interface UiAriaTabsSignature {
  Args: {
    defaultTab: string;
  };
  Blocks: {
    default: [UiAriaTabsRegistry];
  };
  Element: HTMLDivElement;
}

export default class UiAriaTabs extends Component<UiAriaTabsSignature> {
  @tracked private activeTabOverride?: string;

  get activeTab(): string {
    return this.activeTabOverride ?? this.args.defaultTab;
  }

  @action
  selectTab(tabId: string): void {
    this.activeTabOverride = tabId;
  }

  <template>
    <div class="ui-aria-tabs" ...attributes>
      {{yield
        (hash
          Tab=(component
            UiAriaTab currentTab=this.activeTab onSelect=this.selectTab
          )
          activeTab=this.activeTab
          selectTab=this.selectTab
        )
      }}
    </div>
  </template>
}
