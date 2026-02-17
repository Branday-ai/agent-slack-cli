import { config } from "dotenv";
import { join } from "path";

// Load .env from the calling repo's directory (process.cwd()), not from this package's directory.
// This allows each agent repo to have its own .env with its own tokens and channel config.
config({ path: join(process.cwd(), ".env") });

export interface ChannelConfig {
  name: string;
  id: string;
}

function parseChannels(channelsStr: string): ChannelConfig[] {
  if (!channelsStr) return [];
  return channelsStr.split(",").map((entry) => {
    const [name, id] = entry.trim().split(":");
    return { name, id };
  });
}

// Auto-discover agent tokens from SLACK_BOT_TOKEN_* env vars
function parseAgentTokens(): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^SLACK_BOT_TOKEN_(\w+)$/);
    if (match && value) {
      tokens[match[1].toLowerCase()] = value;
    }
  }
  return tokens;
}

export const slackConfig = {
  botToken: process.env.SLACK_BOT_TOKEN || "",
  channels: parseChannels(process.env.SLACK_CHANNELS || ""),
  defaultChannel: process.env.SLACK_DEFAULT_CHANNEL || "",
  // Legacy single channel support
  channelId: process.env.SLACK_CHANNEL_ID || "",
  // Agent-specific tokens for replies (auto-discovered from SLACK_BOT_TOKEN_*)
  agentTokens: parseAgentTokens(),
  // Self-message filtering (set SLACK_SELF_BOT_NAME to filter own bot messages)
  selfBotName: process.env.SLACK_SELF_BOT_NAME || "",
};

// State file paths — configurable via SLACK_STATE_DIR, defaults to <cwd>/memory
const stateDir = process.env.SLACK_STATE_DIR || join(process.cwd(), "memory");
export const paths = {
  slackState: join(stateDir, "slack_state.json"),
  memoryLogs: join(stateDir, "logs"),
  inbox: join(stateDir, "slack_inbox.json"),
};

export function getPostingToken(agentName?: string): string {
  if (agentName) {
    const token = slackConfig.agentTokens[agentName.toLowerCase()];
    if (!token) {
      throw new Error(
        `No token configured for agent "${agentName}". Set SLACK_BOT_TOKEN_${agentName.toUpperCase()} in .env`
      );
    }
    return token;
  }
  // No agent specified — single-agent mode, use the default bot token
  return slackConfig.botToken;
}

export function getChannelByName(name: string): ChannelConfig | undefined {
  return slackConfig.channels.find((c) => c.name === name);
}

export function getChannelById(id: string): ChannelConfig | undefined {
  return slackConfig.channels.find((c) => c.id === id);
}

export function getDefaultChannel(): ChannelConfig | undefined {
  return getChannelByName(slackConfig.defaultChannel) || slackConfig.channels[0];
}

export function validateConfig(): void {
  if (!slackConfig.botToken) {
    throw new Error("SLACK_BOT_TOKEN is required in .env");
  }
  if (slackConfig.channels.length === 0 && !slackConfig.channelId) {
    throw new Error("SLACK_CHANNELS or SLACK_CHANNEL_ID is required in .env");
  }
}

/**
 * Resolve --as <agent> from CLI args.
 * - If agent tokens exist in env, --as is required for posting commands.
 * - If no agent tokens exist (single-agent mode), --as is optional.
 * Returns the agent name or undefined.
 */
export function resolveAgent(args: string[]): string | undefined {
  const asIndex = args.indexOf("--as");
  const agentName = asIndex !== -1 ? args[asIndex + 1] : undefined;

  const hasAgentTokens = Object.keys(slackConfig.agentTokens).length > 0;
  if (!agentName && hasAgentTokens) {
    const available = Object.keys(slackConfig.agentTokens).join(", ");
    console.error(`Error: --as <agent> is required. Available: ${available}`);
    process.exit(1);
  }

  return agentName;
}

/**
 * Resolve target channel from --channel arg or default.
 */
export function resolveChannel(channelName?: string): ChannelConfig {
  let targetChannel = channelName
    ? getChannelByName(channelName)
    : getDefaultChannel();

  // Fallback to legacy single channel if no channels configured
  if (!targetChannel && slackConfig.channelId) {
    targetChannel = { name: "default", id: slackConfig.channelId };
  }

  if (!targetChannel) {
    console.error(`Error: Channel "${channelName || "default"}" not found`);
    console.error("Available channels:", slackConfig.channels.map((c) => c.name).join(", "));
    process.exit(1);
  }

  return targetChannel;
}
