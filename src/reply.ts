import { WebClient } from "@slack/web-api";
import {
  slackConfig,
  validateConfig,
  getPostingToken,
  resolveAgent,
  resolveChannel,
  resolveDmChannel,
} from "./config.js";
import { formatForSlack } from "./format.js";
import { readFileSync } from "fs";

validateConfig();

function readStdin(): string {
  try {
    return readFileSync(0, "utf-8").trim();
  } catch {
    return "";
  }
}

export async function reply(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    const hasAgentTokens = Object.keys(slackConfig.agentTokens).length > 0;
    const agentFlag = hasAgentTokens ? " --as <agent>" : "";
    console.log(`Usage: pnpm slack:reply <message>${agentFlag} [--thread <ts>] [--channel <name>]`);
    console.log(
      `       echo 'message' | pnpm slack:reply --stdin${agentFlag} [--thread <ts>] [--channel <name>]`
    );
    console.log("");
    console.log("Options:");
    if (hasAgentTokens) {
      const agents = Object.keys(slackConfig.agentTokens).join(", ");
      console.log(`  --as <agent>      Agent to reply as (${agents})`);
    }
    console.log(
      "  --channel <name>  Channel to post to (default: " + slackConfig.defaultChannel + ")"
    );
    console.log("  --thread <ts>     Thread timestamp to reply to");
    console.log("  --stdin           Read message from stdin");
    console.log("  --channel-id <id> Direct channel ID (alternative to --channel)");
    console.log("");
    console.log("Available channels:");
    for (const ch of slackConfig.channels) {
      const isDefault = ch.name === slackConfig.defaultChannel ? " (default)" : "";
      console.log(`  ${ch.name}${isDefault}`);
    }
    process.exit(1);
  }

  let message: string | undefined;
  let threadTs: string | undefined;
  let channelName: string | undefined;
  let channelId: string | undefined;
  let useStdin = false;

  const THREAD_FLAGS = new Set(["--thread", "--thread-ts", "--thread_ts"]);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (THREAD_FLAGS.has(arg) && args[i + 1]) {
      threadTs = args[i + 1];
      i++;
    } else if (arg === "--channel" && args[i + 1]) {
      channelName = args[i + 1];
      i++;
    } else if (arg === "--channel-id" && args[i + 1]) {
      channelId = args[i + 1];
      i++;
    } else if (arg === "--as" && args[i + 1]) {
      i++; // Skip the value, handled by resolveAgent
    } else if (arg === "--stdin") {
      useStdin = true;
    } else if (arg.startsWith("--")) {
      console.error(`Error: Unknown flag: ${arg}`);
      console.error(`Known flags: --thread, --channel, --channel-id, --as, --stdin`);
      process.exit(1);
    } else if (message !== undefined) {
      console.error(`Error: Multiple positional arguments. First message: ${JSON.stringify(message)}, second: ${JSON.stringify(arg)}`);
      console.error(`Did you forget quotes around the message, or use an unknown flag that swallowed its value?`);
      process.exit(1);
    } else {
      message = arg;
    }
  }

  const agentName = resolveAgent(args);

  if (useStdin) {
    message = readStdin();
  }

  if (!message) {
    console.error("Error: Message is required");
    process.exit(1);
  }

  // Get posting token (agent-specific or default)
  let token: string;
  try {
    token = getPostingToken(agentName);
  } catch (error: any) {
    console.error("Error:", error.message);
    process.exit(1);
  }

  const client = new WebClient(token);

  // Determine target channel
  let targetChannelId: string;
  let targetChannelName: string;

  if (channelId) {
    // Direct channel ID override
    targetChannelId = channelId;
    targetChannelName = channelId;
  } else if (channelName?.startsWith("@")) {
    // DM by @username
    try {
      const resolved = resolveDmChannel(channelName.slice(1));
      targetChannelId = resolved.id;
      targetChannelName = resolved.name;
    } catch (error: any) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  } else {
    const resolved = resolveChannel(channelName);
    targetChannelId = resolved.id;
    targetChannelName = resolved.name;
  }

  try {
    // Convert markdown to Slack-appropriate format
    const slackMessage = formatForSlack(message);

    const result = await client.chat.postMessage({
      channel: targetChannelId,
      text: slackMessage,
      thread_ts: threadTs,
    });

    if (result.ok) {
      const agentLabel = agentName ? ` as ${agentName}` : "";
      console.log(`Message posted successfully${agentLabel}.`);
      console.log(`  Channel: #${targetChannelName} (${result.channel})`);
      console.log(`  Timestamp: ${result.ts}`);
      if (threadTs) {
        console.log(`  Thread: ${threadTs}`);
      }
    } else {
      console.error("Failed to post message:", result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error("Error posting message:", error);
    process.exit(1);
  }
}

// Direct invocation support
if (process.argv[1]?.endsWith("reply.ts") || process.argv[1]?.endsWith("reply.js")) {
  reply();
}
