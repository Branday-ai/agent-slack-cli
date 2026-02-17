import { WebClient } from "@slack/web-api";
import { slackConfig, validateConfig, getPostingToken, resolveAgent } from "./config.js";
import { resolveMessageAuthor } from "./format.js";
import type { SearchResult } from "./types.js";

validateConfig();

async function searchChannelHistory(
  client: WebClient,
  channelId: string,
  channelName: string,
  query: string,
  limit: number
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase();

  try {
    // Fetch recent history (up to 200 messages)
    const history = await client.conversations.history({
      channel: channelId,
      limit: 200,
    });

    if (!history.messages) return results;

    for (const msg of history.messages) {
      if (!msg.text || !msg.ts) continue;

      // Search in message text
      if (msg.text.toLowerCase().includes(queryLower)) {
        const username = await resolveMessageAuthor(client, msg as any);

        const date = new Date(parseFloat(msg.ts) * 1000);
        results.push({
          channel: channelName,
          channelId,
          user: username,
          text: msg.text,
          ts: msg.ts,
          timestamp: date.toISOString(),
        });

        if (results.length >= limit) break;
      }
    }
  } catch (error: any) {
    // Skip channels we can't access
    if (error.data?.error !== "channel_not_found" && error.data?.error !== "not_in_channel") {
      console.error(`Error searching #${channelName}:`, error.message);
    }
  }

  return results;
}

async function searchHistory(
  client: WebClient,
  query: string,
  limit: number = 10,
  channelFilter?: string
): Promise<void> {
  const channelsToSearch = channelFilter
    ? slackConfig.channels.filter((c) => c.name === channelFilter)
    : slackConfig.channels;

  if (channelsToSearch.length === 0) {
    console.error("No channels to search");
    return;
  }

  console.log(`Searching for "${query}" in ${channelsToSearch.length} channel(s)...\n`);

  const allResults: SearchResult[] = [];

  for (const channel of channelsToSearch) {
    const results = await searchChannelHistory(client, channel.id, channel.name, query, limit);
    allResults.push(...results);
  }

  // Sort by timestamp (newest first)
  allResults.sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts));

  // Limit total results
  const limitedResults = allResults.slice(0, limit);

  if (limitedResults.length === 0) {
    console.log("No messages found matching your query.");
    return;
  }

  console.log(`Found ${limitedResults.length} message(s):\n`);

  for (const result of limitedResults) {
    const date = new Date(result.timestamp);
    const dateStr = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    console.log(`[${dateStr}] #${result.channel} - ${result.user}:`);
    console.log(
      `  ${result.text.substring(0, 200)}${result.text.length > 200 ? "..." : ""}`
    );
    console.log(`  ts: ${result.ts}`);
    console.log();
  }
}

export async function search(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: slack search <query> [--limit N] [--channel NAME]');
    console.log("");
    console.log("Examples:");
    console.log('  slack search "email"');
    console.log('  slack search "deploy" --limit 5');
    console.log('  slack search "design" --channel product');
    process.exit(1);
  }

  let query = "";
  let limit = 10;
  let channelFilter: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--channel" && args[i + 1]) {
      channelFilter = args[i + 1];
      i++;
    } else if (args[i] === "--as" && args[i + 1]) {
      i++;
    } else if (!query) {
      query = args[i];
    }
  }

  const agentName = resolveAgent(args);
  let token: string;
  try {
    token = getPostingToken(agentName);
  } catch (error: any) {
    console.error("Error:", error.message);
    process.exit(1);
  }

  const client = new WebClient(token);
  await searchHistory(client, query, limit, channelFilter);
}

if (process.argv[1]?.endsWith("search.ts") || process.argv[1]?.endsWith("search.js")) {
  search();
}
