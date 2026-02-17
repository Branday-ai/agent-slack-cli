import { WebClient } from "@slack/web-api";
import {
  slackConfig,
  validateConfig,
  getPostingToken,
  resolveAgent,
  resolveChannel,
} from "./config.js";

validateConfig();

export async function react(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    const hasAgentTokens = Object.keys(slackConfig.agentTokens).length > 0;
    const agentFlag = hasAgentTokens ? " [--as <agent>]" : "";
    console.log(`Usage: pnpm slack:react <timestamp> <emoji>${agentFlag} [--channel <name>] [--remove]`);
    console.log("");
    console.log("Examples:");
    console.log("  pnpm slack:react 1768822580.458979 eyes");
    console.log("  pnpm slack:react 1768822580.458979 white_check_mark --channel pm-test");
    console.log("  pnpm slack:react 1768822580.458979 thumbsup --remove");
    console.log("");
    console.log("Common emoji: thumbsup, eyes, white_check_mark, rocket, heart, +1, tada, fire");
    process.exit(1);
  }

  let timestamp = "";
  let emoji = "";
  let channelName: string | undefined;
  let remove = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--channel" && args[i + 1]) {
      channelName = args[i + 1];
      i++;
    } else if (args[i] === "--as" && args[i + 1]) {
      i++; // Skip, handled by resolveAgent
    } else if (args[i] === "--remove") {
      remove = true;
    } else if (!timestamp) {
      timestamp = args[i];
    } else if (!emoji) {
      // Strip colons if provided (e.g., :thumbsup: → thumbsup)
      emoji = args[i].replace(/^:|:$/g, "");
    }
  }

  const agentName = resolveAgent(args);

  if (!timestamp) {
    console.error("Error: Timestamp is required");
    process.exit(1);
  }

  if (!emoji) {
    console.error("Error: Emoji name is required");
    process.exit(1);
  }

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
    if (remove) {
      await client.reactions.remove({
        channel: targetChannel.id,
        timestamp,
        name: emoji,
      });
    } else {
      await client.reactions.add({
        channel: targetChannel.id,
        timestamp,
        name: emoji,
      });
    }

    const action = remove ? "Removed" : "Added";
    const agentLabel = agentName ? ` as ${agentName}` : "";
    console.log(`${action} :${emoji}: reaction${agentLabel}.`);
    console.log(`  Channel: #${targetChannel.name}`);
    console.log(`  Timestamp: ${timestamp}`);
  } catch (error: any) {
    if (error.data?.error === "already_reacted") {
      console.log(`Already reacted with :${emoji}: on this message.`);
    } else if (error.data?.error === "no_reaction") {
      console.log(`No :${emoji}: reaction to remove on this message.`);
    } else if (error.data?.error === "message_not_found") {
      console.error("Error: Message not found. Check the timestamp.");
      process.exit(1);
    } else {
      console.error("Error:", error.data?.error || error);
      process.exit(1);
    }
  }
}

if (process.argv[1]?.endsWith("react.ts") || process.argv[1]?.endsWith("react.js")) {
  react();
}
