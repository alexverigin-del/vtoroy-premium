export type Platform = "telegram" | "max" | "vk";
export type Availability = "unknown" | "allowed" | "blocked";
export type Handling = "bot" | "queued" | "agent" | "waiting" | "closed";
export type MediaKind = "image" | "voice" | "audio" | "video" | "document";
export type ProviderResume =
  | {
      platform: "max";
      attachment: {
        type: "image" | "video" | "audio" | "file";
        payload: { token: string };
      };
    }
  | { platform: "vk"; attachment: string };
export type Outcome =
  | { type: "accepted"; externalId: string }
  | { type: "rate_limited"; retryAfter: number; resume?: ProviderResume }
  | { type: "retryable"; code: string; resume?: ProviderResume }
  | { type: "blocked" | "connection_error" | "rejected" | "unknown"; code: string };
export interface AttachmentRef {
  kind: MediaKind;
  externalId: string;
  name: string;
  mime: string;
  size: number | null;
  url?: string;
}
export interface IncomingEvent {
  id: string;
  platform: Platform;
  actorId: string;
  peerId: string;
  kind: "message" | "edited" | "callback" | "availability" | "started" | "unsupported" | "staff";
  raw?: unknown;
  occurredAt: string;
  externalMessageId?: string;
  text: string;
  callbackId?: string;
  callbackData?: string;
  availability?: Availability;
  attachments: AttachmentRef[];
  albumId?: string;
}
export interface Connection {
  id: string;
  platform: Platform;
  external_id: string;
  enabled: boolean;
  mode: "test" | "production";
  store_id: string;
  bot_username?: string;
  service_user_id?: string;
  worker_user_id: string;
  secret_ref: string;
  settings: Record<string, unknown>;
  marketing_enabled: boolean;
}
export interface Command {
  type:
    | "claim"
    | "assign"
    | "reply"
    | "note"
    | "handling"
    | "read"
    | "subscription"
    | "link_start"
    | "campaign_review"
    | "campaign_approve"
    | "campaign_cancel";
  key: string;
  conversation_id?: string;
  expected_version?: number;
  payload: Record<string, unknown>;
}
export interface Actor {
  user: string;
  accountability: Record<string, unknown>;
}
export interface Operation {
  id: string;
  connection_id: string;
  thread_id: string;
  message_id: string | null;
  outbox_id: string;
  method: string;
  payload: Record<string, unknown>;
  attempt_id: string;
  lease_version: number;
  external_id?: string;
}
// Directus injects Knex and its services at runtime. Keep this boundary independent of its private types.
export type Database = any;
export interface Services {
  ItemsService: new (collection: string, options: any) => any;
}
export interface Context {
  database: Database;
  services: Services;
  getSchema: () => Promise<unknown>;
  env: Record<string, unknown>;
}
