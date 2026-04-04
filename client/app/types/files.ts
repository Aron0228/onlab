export interface UploadedFilePayload {
  id: number;
  workspaceId?: number | null;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
}
