import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import UiButton from 'client/components/ui/button';
import { on } from '@ember/modifier';

interface UploadedFilePayload {
  id: number;
  workspaceId?: number | null;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
}

interface UiFileUploadSignature {
  Args: {
    extensions: string[];
    workspaceId?: number;
    uploadPath?: string;
    onUploaded?: (file: UploadedFilePayload) => void | Promise<void>;
  };
  Element: HTMLDivElement;
}

type SessionServiceLike = {
  data: {
    authenticated: {
      token?: string;
    };
  };
};

export default class UiFileUpload extends Component<UiFileUploadSignature> {
  @service declare session: SessionServiceLike;

  @tracked selectedFile: globalThis.File | null = null;
  @tracked errorMessage: string | null = null;
  @tracked isUploading = false;
  @tracked uploadedFileName: string | null = null;

  get acceptValue(): string {
    return this.args.extensions
      .map((extension) =>
        extension.startsWith('.')
          ? extension.toLowerCase()
          : `.${extension.toLowerCase()}`
      )
      .join(',');
  }

  get hasSelection(): boolean {
    return this.selectedFile !== null;
  }

  get isUploadDisabled(): boolean {
    return this.isUploading || !this.hasSelection;
  }

  @action handleFileSelection(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    this.errorMessage = null;
    this.uploadedFileName = null;

    if (!file) {
      this.selectedFile = null;
      return;
    }

    if (!this.isExtensionAllowed(file.name)) {
      this.selectedFile = null;
      input.value = '';
      this.errorMessage = `Allowed extensions: ${this.acceptValue}`;
      return;
    }

    this.selectedFile = file;
  }

  @action async uploadSelectedFile(): Promise<void> {
    if (!this.selectedFile) {
      this.errorMessage = 'Select a file first.';
      return;
    }

    const token = this.session.data.authenticated.token;

    if (!token) {
      this.errorMessage = 'Missing authentication token.';
      return;
    }

    this.isUploading = true;
    this.errorMessage = null;

    try {
      const apiUrl =
        (import.meta.env.VITE_API_URL as string | undefined) ??
        'http://localhost:30022';
      const url = new URL('/files/upload', apiUrl);

      url.searchParams.set('token', token);
      url.searchParams.set('originalName', this.selectedFile.name);

      if (this.args.workspaceId != null) {
        url.searchParams.set('workspaceId', this.args.workspaceId.toString());
      }

      if (this.args.uploadPath) {
        url.searchParams.set('uploadPath', this.args.uploadPath);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': this.selectedFile.type || 'application/octet-stream',
        },
        body: this.selectedFile,
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      const uploadedFile = (await response.json()) as UploadedFilePayload;
      this.uploadedFileName = uploadedFile.originalName;
      this.selectedFile = null;

      if (this.args.onUploaded) {
        await this.args.onUploaded(uploadedFile);
      }
    } catch (error: unknown) {
      this.errorMessage =
        error instanceof Error ? error.message : 'Upload failed.';
    } finally {
      this.isUploading = false;
    }
  }

  private isExtensionAllowed(fileName: string): boolean {
    const normalizedExtensions = this.args.extensions.map((extension) =>
      extension.startsWith('.')
        ? extension.toLowerCase()
        : `.${extension.toLowerCase()}`
    );

    return normalizedExtensions.some((extension) =>
      fileName.toLowerCase().endsWith(extension)
    );
  }

  <template>
    <div class="layout-vertical --gap-sm" ...attributes>
      <input
        type="file"
        accept={{this.acceptValue}}
        {{on "change" this.handleFileSelection}}
      />

      <UiButton
        @text={{if this.isUploading "Uploading..." "Upload file"}}
        @disabled={{this.isUploadDisabled}}
        @onClick={{this.uploadSelectedFile}}
      />

      {{#if this.selectedFile}}
        <p>Selected: {{this.selectedFile.name}}</p>
      {{/if}}

      {{#if this.uploadedFileName}}
        <p>Uploaded: {{this.uploadedFileName}}</p>
      {{/if}}

      {{#if this.errorMessage}}
        <p>{{this.errorMessage}}</p>
      {{/if}}
    </div>
  </template>
}
