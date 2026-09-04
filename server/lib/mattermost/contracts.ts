export type MattermostEventKind =
  | "workspace.upsert"
  | "workspace.delete"
  | "membership.upsert"
  | "membership.delete"
  | "conversation.upsert"
  | "conversation.delete"
  | "message.create"
  | "user.activate"
  | "user.deactivate";

export type PluginCreatePostRequest = {
  event_id: string;
  crm_message_id: string;
  mattermost_channel_id: string;
  mattermost_user_id: string;
  message: string;
};

export type PluginPostEvent = {
  event_id: string;
  post_id: string;
  channel_id: string;
  user_id: string;
  message: string;
  create_at: number;
};

export type MattermostSyncResult =
  | { ok: true; userId?: string }
  | { ok: false; retryable: boolean; message: string };
