export interface SlackState {
  last_read_ts: string;
  channel_id: string;
}

// Multi-channel state: tracks last_read_ts per channel
export interface MultiChannelState {
  channels: Record<string, string>; // channelId -> last_read_ts
}

export interface SlackMessage {
  ts: string;
  user: string;
  username?: string;
  text: string;
  thread_ts?: string;
}

export interface FormattedMessage {
  timestamp: string;
  user: string;
  userId?: string; // Slack user ID (e.g., U0AFEP22HV2) for team member identification
  text: string;
  thread_ts?: string;
  ts: string;
  images?: string[]; // Local paths to downloaded images
  files?: string[]; // Local paths to downloaded files (PDFs, docs, etc.)
}

export interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  url_private: string;
  url_private_download: string;
}

export interface InboxEntry {
  channel: string;
  user: string;
  text: string;
  ts: string;
  timestamp: string;
}

export interface ChannelResult {
  channelName: string;
  channelId: string;
  teamMessages: FormattedMessage[];
  automatedMessageCount: number;
  latestTs: string | null;
}

export interface ChannelMessages {
  channelName: string;
  channelId: string;
  messages: FormattedMessage[];
  latestTs: string | null;
}

export interface SlackFileAttachment {
  id: string;
  name: string;
  mimetype?: string;
  url_private?: string;
  url_private_download?: string;
}

export interface SearchResult {
  channel: string;
  channelId: string;
  user: string;
  text: string;
  ts: string;
  timestamp: string;
  permalink?: string;
}

export interface CheckResult {
  hasReassignment: boolean;
  message?: string;
  newTicket?: string;
  originalText?: string;
}

export interface ReadyRoomState {
  [agentId: string]: boolean;
}
