export interface MediaAsset {
  id: string;
  org_id: string;
  kind: "image" | "video";
  name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  duration_ms: number | null;
  url: string | null;
}

export interface PlaylistItem {
  id: string;
  org_id: string;
  playlist_id: string;
  position: number;
  kind: "image" | "video" | "text";
  asset_id: string | null;
  body: string | null;
  duration_ms: number | null;
  is_enabled: boolean;
}

export interface NamedOption {
  id: string;
  name: string;
}

export interface AssignableScreen {
  id: string;
  name: string | null;
  playlist_id: string | null;
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
