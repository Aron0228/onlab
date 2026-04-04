import Component from '@glimmer/component';
import UiButton from 'client/components/ui/button';
import UiIcon from 'client/components/ui/icon';
import { action } from '@ember/object';
import { guidFor } from '@ember/object/internals';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import UiLoadingSpinner from 'client/components/ui/loading-spinner';
import { eq } from 'ember-truth-helpers';

interface AvatarModelLike {
  avatarUrl?: string | null;
  name?: string;
  fullName?: string;
  username?: string;
  id?: string | number | null;
}

interface SessionServiceLike {
  data: {
    authenticated?: {
      token?: string;
    };
  };
}

const syncImageState = modifier(
  (
    element: HTMLImageElement,
    [src]: [string | null],
    named: {
      onReady: (element: HTMLImageElement) => void;
      onError: (element: HTMLImageElement) => void;
    }
  ) => {
    if (!src || !element.complete) {
      return;
    }

    if (element.naturalWidth > 0) {
      named.onReady(element);
      return;
    }

    named.onError(element);
  }
);

export interface UiAvatarSignature {
  // The arguments accepted by the component
  Args: {
    model?: AvatarModelLike | null;
    size?: 'sm' | 'md';
    onChange?: (file: File) => void;
    squared?: boolean;
  };
  // Any blocks yielded by the component
  Blocks: {
    default: [];
  };
  // The element to which `...attributes` is applied in the component template
  Element: null;
}
export default class UiAvatar extends Component<UiAvatarSignature> {
  @service declare session: SessionServiceLike;

  @tracked avatarPreviewUrl: string | null = null;
  @tracked loadedSrc: string | null = null;
  @tracked failedSrc: string | null = null;

  willDestroy() {
    super.willDestroy?.();

    if (this.avatarPreviewUrl) {
      URL.revokeObjectURL(this.avatarPreviewUrl);
    }
  }

  get sourceUrl(): string | null {
    return this.avatarPreviewUrl ?? this.args.model?.avatarUrl ?? null;
  }

  get src(): string | null {
    const sourceUrl = this.sourceUrl;

    if (!sourceUrl) {
      return null;
    }

    if (this.avatarPreviewUrl) {
      return sourceUrl;
    }

    const token = this.session.data.authenticated?.token;

    if (!token) {
      return sourceUrl;
    }

    const separator = sourceUrl.includes('?') ? '&' : '?';

    return `${sourceUrl}${separator}token=${encodeURIComponent(token)}`;
  }

  get imageKey(): string | null {
    return this.sourceUrl;
  }

  get alt(): string {
    const model = this.args.model;

    return String(
      model?.name ?? model?.fullName ?? model?.username ?? model?.id ?? 'Avatar'
    );
  }

  get hasImage(): boolean {
    return Boolean(this.src) && this.failedSrc !== this.imageKey;
  }

  get isLoading(): boolean {
    return (
      Boolean(this.src) && this.loadedSrc !== this.imageKey && !this.hasFailed
    );
  }

  get showsLoadingState(): boolean {
    return this.isEditable && this.isLoading;
  }

  get hasFailed(): boolean {
    return Boolean(this.src) && this.failedSrc === this.imageKey;
  }

  get id() {
    return guidFor(this);
  }

  get fileInputId() {
    return `${this.id}FileInput`;
  }

  get isSquared(): boolean {
    return Boolean(this.args.squared);
  }

  get isClickableSquaredUpload(): boolean {
    return this.isSquared && Boolean(this.args.onChange);
  }

  get showsUploadButton(): boolean {
    return Boolean(this.args.onChange) && !this.isSquared;
  }

  get showsFileInput(): boolean {
    return Boolean(this.args.onChange);
  }

  get isEditable(): boolean {
    return Boolean(this.args.onChange);
  }

  @action onUploadClick() {
    const input = document.getElementById(
      this.fileInputId
    ) as HTMLInputElement | null;

    if (input) {
      input.click();
    }
  }

  @action onFrameClick() {
    if (!this.isClickableSquaredUpload) {
      return;
    }

    this.onUploadClick();
  }

  @action onFrameKeydown(event: KeyboardEvent) {
    if (!this.isClickableSquaredUpload) {
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    this.onUploadClick();
  }

  @action
  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (this.avatarPreviewUrl) {
      URL.revokeObjectURL(this.avatarPreviewUrl);
    }

    this.avatarPreviewUrl = URL.createObjectURL(file);
    this.loadedSrc = null;
    this.failedSrc = null;

    if (this.args.onChange) {
      this.args.onChange(file);
    }
  }

  @action onImageReady(elementOrEvent: HTMLImageElement | Event) {
    const element =
      elementOrEvent instanceof HTMLImageElement
        ? elementOrEvent
        : (elementOrEvent.currentTarget as HTMLImageElement | null);

    const imageKey = this.imageKey;

    if (!imageKey || !element) {
      return;
    }

    this.loadedSrc = imageKey;
    this.failedSrc = null;
  }

  @action onImageError(elementOrEvent: HTMLImageElement | Event) {
    const element =
      elementOrEvent instanceof HTMLImageElement
        ? elementOrEvent
        : (elementOrEvent.currentTarget as HTMLImageElement | null);

    const imageKey = this.imageKey;

    if (!imageKey || !element) {
      return;
    }

    this.failedSrc = imageKey;
    this.loadedSrc = null;
  }

  <template>
    <div class="layout-horizontal --gap-md">
      <div
        class="ui-avatar-frame
          {{if this.isSquared '--squared'}}
          {{if this.isEditable '--editable'}}
          {{if this.isClickableSquaredUpload '--uploadable'}}
          {{if (eq @size 'sm') '--size-sm'}}"
        aria-busy={{this.showsLoadingState}}
        role={{if this.isClickableSquaredUpload "button"}}
        tabindex={{if this.isClickableSquaredUpload "0"}}
        {{on "click" this.onFrameClick}}
        {{on "keydown" this.onFrameKeydown}}
      >
        {{#if this.hasImage}}
          <img
            class="ui-avatar {{if this.isSquared '--squared'}}"
            src={{this.src}}
            alt={{this.alt}}
            id={{this.id}}
            {{on "load" this.onImageReady}}
            {{on "error" this.onImageError}}
            {{syncImageState
              this.src
              onReady=this.onImageReady
              onError=this.onImageError
            }}
          />
        {{/if}}

        {{#if this.showsLoadingState}}
          <div class="ui-avatar-frame__loader">
            <UiLoadingSpinner />
          </div>
        {{/if}}

        {{#unless this.hasImage}}
          <div class="ui-avatar-frame__fallback">
            <UiIcon @name="user" @size="lg" />
          </div>
        {{/unless}}
      </div>

      {{#if this.showsUploadButton}}
        <UiButton @text="Upload Photo" @onClick={{this.onUploadClick}} />
      {{/if}}

      {{#if this.showsFileInput}}
        <input
          id={{this.fileInputId}}
          type="file"
          accept="image/*"
          hidden
          {{on "change" this.onFileChange}}
        />
      {{/if}}
    </div>
  </template>
}
