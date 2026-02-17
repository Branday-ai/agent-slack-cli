/**
 * Slack message formatting and display utilities.
 * Converts markdown to Slack mrkdwn, strips shell artifacts, resolves user IDs.
 */

import { WebClient } from "@slack/web-api";

const userCache = new Map<string, string>();

/**
 * Resolve a Slack user ID to a display name. Results are cached.
 */
export async function getUserName(client: WebClient, userId: string): Promise<string> {
  const cached = userCache.get(userId);
  if (cached) return cached;

  try {
    const result = await client.users.info({ user: userId });
    const name = result.user?.real_name || result.user?.name || userId;
    userCache.set(userId, name);
    return name;
  } catch {
    return userId;
  }
}

/**
 * Resolve a message's author to a display name.
 * Handles bot messages, user messages, and unknowns.
 */
export async function resolveMessageAuthor(
  client: WebClient,
  msg: { user?: string; bot_id?: string; username?: string; subtype?: string }
): Promise<string> {
  const isBot = !!msg.bot_id || msg.subtype === "bot_message";
  if (isBot) {
    return msg.username || "Bot";
  }
  if (msg.user) {
    return getUserName(client, msg.user);
  }
  return "Unknown";
}

/**
 * Convert markdown formatting to Slack mrkdwn and clean up shell artifacts.
 *
 * Transformations:
 * - ## headings → stripped (Slack has no heading syntax)
 * - **bold** → *bold* (Slack uses single asterisks)
 * - [text](url) → text + url on next line
 * - \! \? → ! ? (zsh shell escape artifacts)
 * - __underline__ → _italic_ (Slack has no underline; map to italic)
 */
export function formatForSlack(text: string): string {
  let result = text;

  // Remove markdown heading markers (##, ###, etc.) at start of lines
  result = result.replace(/^#{1,6}\s+/gm, "");

  // Convert markdown links [text](url) to "text\nurl"
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1\n$2");

  // Convert **bold** to *bold* (Slack uses single asterisks for bold)
  result = result.replace(/\*\*([^*]+)\*\*/g, "*$1*");

  // Convert __text__ to _text_ (Slack italic, no underline support)
  result = result.replace(/__([^_]+)__/g, "_$1_");

  // Remove shell escape artifacts (zsh escapes ! and ? even in single quotes)
  result = result.replace(/\\([!?])/g, "$1");

  return result;
}
