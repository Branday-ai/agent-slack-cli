import { WebClient } from "@slack/web-api";
import {
  slackConfig,
  validateConfig,
  getPostingToken,
  resolveAgent,
  resolveChannel,
} from "./config.js";
import { resolveMessageAuthor } from "./format.js";

validateConfig();

export async function history(): Promise<void> {
  const args = process.argv.slice(2);

  let channelName: string | undefined;
  let limit = 10;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--channel" && args[i + 1]) {
      channelName = args[i + 1];
      i++;
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--as" && args[i + 1]) {
      i++;
    } else if (!args[i].startsWith("--") && !channelName) {
      // Positional arg: treat first bare word as channel name
      channelName = args[i];
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
  const targetChannel = resolveChannel(channelName);

  try {
    const result = await client.conversations.history({
      channel: targetChannel.id,
      limit,
    });

    if (!result.ok || !result.messages || result.messages.length === 0) {
      console.log(`No messages found in #${targetChannel.name}.`);
      return;
    }

    // Reverse so oldest is first (chronological order)
    const messages = result.messages.reverse();

    console.log(`Last ${messages.length} message(s) in #${targetChannel.name}:\n`);

    for (const msg of messages) {
      const ts = parseFloat(msg.ts || "0");
      const date = new Date(ts * 1000);
      const timeStr = date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      const user = await resolveMessageAuthor(client, msg as any);
      const text = msg.text || "(no text)";

      console.log(`[${timeStr}] ${user}:`);
      console.log(`  ${text}`);

      // Show file attachments if present
      if ((msg as any).files && Array.isArray((msg as any).files)) {
        for (const file of (msg as any).files) {
          const name = file.name || "unnamed";
          const mimetype = file.mimetype || "unknown";
          const url = file.url_private || file.permalink || "";
          if (mimetype.startsWith("image/")) {
            console.log(`  [Image: ${name}] ${url}`);
          } else {
            console.log(`  [File: ${name} (${mimetype})] ${url}`);
          }
        }
      }

      console.log(`  ts: ${msg.ts}`);
      console.log("");
    }
  } catch (error: any) {
    console.error("Error fetching history:", error.data?.error || error);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith("history.ts") || process.argv[1]?.endsWith("history.js")) {
  history();
}
