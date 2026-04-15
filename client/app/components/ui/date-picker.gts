import type Owner from '@ember/owner';
import Component from '@glimmer/component';
import { registerDestructor } from '@ember/destroyable';
import { guidFor } from '@ember/object/internals';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import UiButton from 'client/components/ui/button';
import UiContainer from 'client/components/ui/container';
import UiIcon from 'client/components/ui/icon';

type CalendarDay = {
  date: Date;
  dayNumber: number;
  isCurrentMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
  isoValue: string;
};

export interface UiDatePickerSignature {
  Args: {
    value?: string | Date | null;
    id?: string;
    placeholder?: string;
    disabled?: boolean;
    onInput?: (value: string) => void;
    onChange?: (value: string) => void;
  };
  Element: HTMLDivElement;
}

export default class UiDatePicker extends Component<UiDatePickerSignature> {
  @tracked isOpen = false;
  @tracked visibleMonth = this.initialVisibleMonth();
  @tracked stagedValue = this.normalizeValue(this.args.value);

  handleOutsideClick = (event: MouseEvent) => {
    const target = event.target;

    if (!(target instanceof Node)) {
      return;
    }

    const root = document.getElementById(this.rootId);

    if (!root?.contains(target)) {
      this.closePicker();
    }
  };

  constructor(owner: Owner, args: UiDatePickerSignature['Args']) {
    super(owner, args);

    document.addEventListener('click', this.handleOutsideClick);

    registerDestructor(this, () => {
      document.removeEventListener('click', this.handleOutsideClick);
    });
  }

  get id() {
    return this.args.id ?? guidFor(this);
  }

  get rootId() {
    return `${this.id}-root`;
  }

  get committedValue(): string {
    return this.normalizeValue(this.args.value);
  }

  get displayValue(): string {
    if (!this.committedValue) {
      return this.args.placeholder ?? 'Select date';
    }

    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(this.parseDate(this.committedValue));
  }

  get monthLabel(): string {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long',
    }).format(this.visibleMonth);
  }

  get weekdayLabels(): string[] {
    const formatter = new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
    });
    const monday = new Date(Date.UTC(2026, 3, 13));

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setUTCDate(monday.getUTCDate() + index);

      return formatter.format(date);
    });
  }

  get calendarDays(): CalendarDay[] {
    const monthStart = new Date(
      this.visibleMonth.getFullYear(),
      this.visibleMonth.getMonth(),
      1
    );
    const startOffset = (monthStart.getDay() + 6) % 7;
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - startOffset);
    const selectedValue = this.stagedValue || this.committedValue;
    const today = this.startOfDay(new Date());

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const isoValue = this.formatDate(date);

      return {
        date,
        dayNumber: date.getDate(),
        isCurrentMonth: date.getMonth() === this.visibleMonth.getMonth(),
        isSelected: isoValue === selectedValue,
        isToday: this.formatDate(today) === isoValue,
        isoValue,
      };
    });
  }

  initialVisibleMonth(): Date {
    return this.parseDate(this.args.value ?? this.formatDate(new Date()));
  }

  normalizeValue(value: string | Date | null | undefined): string {
    if (!value) {
      return '';
    }

    if (value instanceof Date) {
      return this.formatDate(value);
    }

    return value;
  }

  parseDate(value: string | Date): Date {
    if (value instanceof Date) {
      return this.startOfDay(value);
    }

    const [year, month, day] = value.split('-').map((part) => Number(part));

    if (!year || !month || !day) {
      return this.startOfDay(new Date());
    }

    return new Date(year, month - 1, day);
  }

  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  dayButtonClass(day: CalendarDay): string {
    return `ui-date-picker__day ${
      day.isSelected ? '--selected' : ''
    } ${!day.isCurrentMonth ? '--muted' : ''} ${day.isToday ? '--today' : ''}`;
  }

  @action
  openPicker(event?: Event) {
    if (this.args.disabled) {
      return;
    }

    event?.stopPropagation();
    this.stagedValue = this.committedValue;
    this.visibleMonth = this.parseDate(
      this.stagedValue || this.formatDate(new Date())
    );
    this.isOpen = true;
  }

  @action
  closePicker() {
    this.isOpen = false;
    this.stagedValue = this.committedValue;
  }

  @action
  keepOpen(event: Event) {
    event.stopPropagation();
  }

  @action
  previousMonth(event?: Event) {
    event?.stopPropagation();
    this.visibleMonth = new Date(
      this.visibleMonth.getFullYear(),
      this.visibleMonth.getMonth() - 1,
      1
    );
  }

  @action
  nextMonth(event?: Event) {
    event?.stopPropagation();
    this.visibleMonth = new Date(
      this.visibleMonth.getFullYear(),
      this.visibleMonth.getMonth() + 1,
      1
    );
  }

  @action
  selectDay(isoValue: string, event?: Event) {
    event?.stopPropagation();
    this.stagedValue = isoValue;
  }

  @action
  commitSelection(event?: Event) {
    event?.stopPropagation();

    const nextValue = this.stagedValue || this.committedValue;

    if (nextValue) {
      this.args.onInput?.(nextValue);
      this.args.onChange?.(nextValue);
    }

    this.isOpen = false;
  }

  <template>
    <div
      id={{this.rootId}}
      class="ui-date-picker {{if this.isOpen '--open'}}"
      ...attributes
    >
      <button
        id={{this.id}}
        type="button"
        class="ui-date-picker__trigger"
        disabled={{@disabled}}
        {{on "click" this.openPicker}}
      >
        <span class="ui-date-picker__trigger-value">{{this.displayValue}}</span>
        <UiIcon @name="calendar-event" />
      </button>

      {{#if this.isOpen}}
        <UiContainer
          @bordered={{true}}
          @variant="primary"
          class="ui-date-picker__popover"
          {{on "click" this.keepOpen}}
        >
          <:header>
            <div class="ui-date-picker__header">
              <button
                type="button"
                class="ui-date-picker__nav"
                {{on "click" this.previousMonth}}
              >
                <UiIcon @name="arrow-left" />
              </button>

              <h3 class="ui-date-picker__title">{{this.monthLabel}}</h3>

              <button
                type="button"
                class="ui-date-picker__nav"
                {{on "click" this.nextMonth}}
              >
                <UiIcon @name="arrow-narrow-right" />
              </button>
            </div>
          </:header>

          <:default>
            <div class="ui-date-picker__weekdays">
              {{#each this.weekdayLabels as |label|}}
                <span class="ui-date-picker__weekday">{{label}}</span>
              {{/each}}
            </div>

            <div class="ui-date-picker__grid">
              {{#each this.calendarDays as |day|}}
                <button
                  type="button"
                  class={{this.dayButtonClass day}}
                  {{on "click" (fn this.selectDay day.isoValue)}}
                >
                  {{day.dayNumber}}
                </button>
              {{/each}}
            </div>

            <div class="ui-date-picker__actions">
              <UiButton
                @text="Cancel"
                @hierarchy="secondary"
                @onClick={{this.closePicker}}
              />
              <UiButton @text="Select" @onClick={{this.commitSelection}} />
            </div>
          </:default>
        </UiContainer>
      {{/if}}
    </div>
  </template>
}
