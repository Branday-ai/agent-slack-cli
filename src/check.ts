import { WebClient } from "@slack/web-api";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";
import { slackConfig, paths, validateConfig, getChannelById } from "./config.js";
import { TEAM_MEMBER_USER_IDS } from "./team.js";
import type {
  MultiChannelState,
  FormattedMessage,
  SlackFileAttachment,
  InboxEntry,
  ChannelMessages,
  ChannelResult,
} from "./types.js";

// Download dirs — configurable via SLACK_DOWNLOAD_DIR, defaults to <cwd>/slack
const downloadDir = process.env.SLACK_DOWNLOAD_DIR || join(process.cwd(), "slack");
const IMAGES_DIR = join(downloadDir, "images");
const FILES_DIR = join(downloadDir, "files");

function loadInbox(): InboxEntry[] {
  try {
    if (existsSync(paths.inbox)) {
      return JSON.parse(readFileSync(paths.inbox, "utf-8"));
    }
  } catch {
    /* ignore */
  }
  return [];
}

function saveInbox(entries: InboxEntry[]): void {
  writeFileSync(paths.inbox, JSON.stringify(entries, null, 2));
}

function printInbox(entries: InboxEntry[]): void {
  if (entries.length === 0) return;
  console.log(`!! ${entries.length} UNREAD TEAM MESSAGE(S) FROM PREVIOUS CHECK !!`);
  for (const e of entries) {
    console.log(`  [${e.timestamp}] ${e.user} in #${e.channel}: ${e.text.substring(0, 500)}`);
  }
  console.log();
}

validateConfig();

const client = new WebClient(slackConfig.botToken);

// Ensure images and files directories exist
if (!existsSync(IMAGES_DIR)) {
  mkdirSync(IMAGES_DIR, { recursive: true });
}
if (!existsSync(FILES_DIR)) {
  mkdirSync(FILES_DIR, { recursive: true });
}

async function downloadImage(file: SlackFileAttachment, messageTs: string): Promise<string | null> {
  const url = file.url_private_download || file.url_private;
  if (!url) return null;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${slackConfig.botToken}`,
      },
    });

    if (!response.ok) {
      console.error(`Failed to download image: ${response.status} ${response.statusText}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const ext = file.name?.split(".").pop() || "png";
    const filename = `${messageTs.replace(".", "_")}_${file.id}.${ext}`;
    const filepath = join(IMAGES_DIR, filename);

    await writeFile(filepath, Buffer.from(buffer));
    return filepath;
  } catch (error) {
    console.error(`Error downloading image:`, error);
    return null;
  }
}

async function downloadFile(file: SlackFileAttachment, messageTs: string): Promise<string | null> {
  const url = file.url_private_download || file.url_private;
  if (!url) return null;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${slackConfig.botToken}`,
      },
    });

    if (!response.ok) {
      console.error(`Failed to download file: ${response.status} ${response.statusText}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const ext = file.name?.split(".").pop() || "file";
    const filename = `${messageTs.replace(".", "_")}_${file.id}.${ext}`;
    const filepath = join(FILES_DIR, filename);

    await writeFile(filepath, Buffer.from(buffer));
    return filepath;
  } catch (error) {
    console.error(`Error downloading file:`, error);
    return null;
  }
}

function loadState(): MultiChannelState {
  if (existsSync(paths.slackState)) {
    const data = readFileSync(paths.slackState, "utf-8");
    const parsed = JSON.parse(data);

    // Already in new multi-channel format
    if (parsed.channels && typeof parsed.channels === "object") {
      return parsed;
    }

    // Handle migration from old single-channel format
    if (parsed.last_read_ts) {
      const channelId =
        parsed.channel_id ||
        (slackConfig.channels.length > 0 ? slackConfig.channels[0].id : slackConfig.channelId);

      if (channelId) {
        return {
          channels: {
            [channelId]: parsed.last_read_ts,
          },
        };
      }
    }
  }
  return { channels: {} };
}

function saveState(state: MultiChannelState): void {
  writeFileSync(paths.slackState, JSON.stringify(state, null, 2));
}

async function getUserName(userId: string): Promise<string> {
  try {
    const result = await client.users.info({ user: userId });
    return result.user?.real_name || result.user?.name || userId;
  } catch {
    return userId;
  }
}

async function fetchChannelMessages(
  channelId: string,
  channelName: string,
  lastReadTs: string
): Promise<ChannelMessages> {
  const result = await client.conversations.history({
    channel: channelId,
    oldest: lastReadTs,
    inclusive: false,
    limit: 100,
  });

  if (!result.messages || result.messages.length === 0) {
    return { channelName, channelId, messages: [], latestTs: null };
  }

  // Sort oldest first
  const allMessages = result.messages.reverse();
  const userCache = new Map<string, string>();
  const formattedMessages: FormattedMessage[] = [];

  for (const msg of allMessages) {
    if (!msg.ts) continue;
    const isBot = !!msg.bot_id || msg.subtype === "bot_message";
    if (!msg.text && !msg.files?.length) continue;

    // Self-message filter: skip messages from our own bot (configurable via SLACK_SELF_BOT_NAME)
    if (slackConfig.selfBotName) {
      const botName = (msg as any).username || (msg as any).bot_profile?.name || "";
      if (botName.includes(slackConfig.selfBotName)) continue;
    }

    let username: string;
    if (isBot) {
      username = (msg as any).username || (msg as any).bot_profile?.name || `Bot (${msg.bot_id})`;
    } else if (msg.user) {
      username = userCache.get(msg.user) || "";
      if (!username) {
        username = await getUserName(msg.user);
        userCache.set(msg.user, username);
      }
    } else {
      username = "Unknown";
    }

    // Download any file attachments
    const imagePaths: string[] = [];
    const filePaths: string[] = [];
    if (msg.files && Array.isArray(msg.files)) {
      for (const file of msg.files) {
        const f = file as SlackFileAttachment;
        if (f.mimetype?.startsWith("image/")) {
          const localPath = await downloadImage(f, msg.ts);
          if (localPath) {
            imagePaths.push(localPath);
          }
        } else if (f.mimetype) {
          // Download non-image files (PDFs, docs, etc.)
          const localPath = await downloadFile(f, msg.ts);
          if (localPath) {
            filePaths.push(localPath);
          }
        }
      }
    }

    const date = new Date(parseFloat(msg.ts) * 1000);
    formattedMessages.push({
      timestamp: date.toISOString(),
      user: username,
      userId: msg.user || undefined,
      text: msg.text || "(no text)",
      thread_ts: msg.thread_ts,
      ts: msg.ts,
      images: imagePaths.length > 0 ? imagePaths : undefined,
      files: filePaths.length > 0 ? filePaths : undefined,
    });
  }

  const latestTs = result.messages[0]?.ts || null;
  return { channelName, channelId, messages: formattedMessages, latestTs };
}

export async function check(): Promise<void> {
  const state = loadState();
  const channelsToCheck =
    slackConfig.channels.length > 0
      ? slackConfig.channels
      : [{ name: "default", id: slackConfig.channelId }];

  const allResults: ChannelResult[] = [];
  let totalTeam = 0;
  let totalAutomated = 0;

  for (const channel of channelsToCheck) {
    const lastReadTs = state.channels[channel.id] || "0";

    try {
      const { channelName, channelId, messages, latestTs } = await fetchChannelMessages(
        channel.id,
        channel.name,
        lastReadTs
      );

      if (messages.length > 0) {
        const teamMsgs = messages.filter((m) => m.userId && TEAM_MEMBER_USER_IDS.has(m.userId));
        const autoCount = messages.length - teamMsgs.length;

        allResults.push({
          channelName,
          channelId,
          teamMessages: teamMsgs,
          automatedMessageCount: autoCount,
          latestTs,
        });

        totalTeam += teamMsgs.length;
        totalAutomated += autoCount;
      }

      // Update state with latest timestamp
      if (latestTs) {
        state.channels[channelId] = latestTs;
      }
    } catch (error) {
      console.error(`Error fetching messages from #${channel.name}:`, error);
    }
  }

  // --- Check for unread messages from previous checks ---
  const previousInbox = loadInbox();
  printInbox(previousInbox);

  if (totalTeam === 0 && totalAutomated === 0) {
    if (previousInbox.length === 0) {
      console.log("No new messages.");
    }
    // Clear inbox — agent has now seen previous messages (they were printed above)
    saveInbox([]);
    saveState(state);
    return;
  }

  // --- Print automated summary (condensed) ---
  for (const result of allResults) {
    if (result.automatedMessageCount > 0) {
      console.log(`#${result.channelName}: ${result.automatedMessageCount} automated message(s)`);
    }
  }

  // --- Print ALL team messages in full ---
  if (totalTeam > 0) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`  ${totalTeam} TEAM MESSAGE(S)`);
    console.log(`${"=".repeat(60)}\n`);

    for (const result of allResults) {
      if (result.teamMessages.length === 0) continue;

      console.log(`--- #${result.channelName} (${result.teamMessages.length} message(s)) ---\n`);

      for (const msg of result.teamMessages) {
        console.log(`[${msg.timestamp}] ${msg.user}:`);
        console.log(`  ${msg.text}`);
        if (msg.images && msg.images.length > 0) {
          console.log(`  [Images attached:]`);
          for (const imgPath of msg.images) {
            console.log(`    - ${imgPath}`);
          }
        }
        if (msg.files && msg.files.length > 0) {
          console.log(`  [Files attached:]`);
          for (const filePath of msg.files) {
            console.log(`    - ${filePath}`);
          }
        }
        if (msg.thread_ts && msg.thread_ts !== msg.ts) {
          console.log(`  (reply in thread ${msg.thread_ts})`);
        }
        console.log(`  [channel: #${result.channelName}] [ts: ${msg.ts}]`);
        console.log();
      }
    }
  }

  // --- Save team messages to persistent inbox ---
  // These persist until the NEXT check confirms the agent saw them.
  const newInbox: InboxEntry[] = [];
  for (const result of allResults) {
    for (const msg of result.teamMessages) {
      newInbox.push({
        channel: result.channelName,
        user: msg.user,
        text: msg.text,
        ts: msg.ts,
        timestamp: msg.timestamp,
      });
    }
  }
  saveInbox(newInbox);

  // --- Final summary line (always visible even with heavy truncation) ---
  const parts: string[] = [];
  for (const result of allResults) {
    const t = result.teamMessages.length;
    const a = result.automatedMessageCount;
    if (t > 0 && a > 0) parts.push(`#${result.channelName}: ${t} team, ${a} auto`);
    else if (t > 0) parts.push(`#${result.channelName}: ${t} team`);
    else if (a > 0) parts.push(`#${result.channelName}: ${a} auto`);
  }
  console.log(`\nTOTAL: ${totalTeam} team, ${totalAutomated} automated | ${parts.join(" | ")}`);

  saveState(state);
}

if (process.argv[1]?.endsWith("check.ts") || process.argv[1]?.endsWith("check.js")) {
  check();
}
