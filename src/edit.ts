import { WebClient } from "@slack/web-api";
import {
  slackConfig,
  validateConfig,
  getPostingToken,
  resolveAgent,
  resolveChannel,
} from "./config.js";
import { formatForSlack } from "./format.js";

validateConfig();

export async function edit(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    const hasAgentTokens = Object.keys(slackConfig.agentTokens).length > 0;
    const agentFlag = hasAgentTokens ? " [--as <agent>]" : "";
    console.log(`Usage: pnpm slack:edit <timestamp> <new_message>${agentFlag} [--channel <name>]`);
    console.log("");
    console.log("Examples:");
    console.log('  pnpm slack:edit 1768822580.458979 "Updated message text"');
    console.log('  pnpm slack:edit 1768822580.458979 "Fixed typo" --channel pm-test');
    console.log("");
    console.log("Note: You can only edit messages posted by the bot.");
    process.exit(1);
  }

  let timestamp = "";
  let message = "";
  let channelName: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--channel" && args[i + 1]) {
      channelName = args[i + 1];
      i++;
    } else if (args[i] === "--as" && args[i + 1]) {
      i++; // Skip, handled by resolveAgent
    } else if (!timestamp) {
      timestamp = args[i];
    } else if (!message) {
      message = args[i];
    }
  }

  const agentName = resolveAgent(args);

  if (!timestamp) {
    console.error("Error: Timestamp is required");
    process.exit(1);
  }

  if (!message) {
    console.error("Error: New message text is required");
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
    const slackMessage = formatForSlack(message);

    const result = await client.chat.update({
      channel: targetChannel.id,
      ts: timestamp,
      text: slackMessage,
    });

    if (result.ok) {
      const agentLabel = agentName ? ` as ${agentName}` : "";
      console.log(`Message edited successfully${agentLabel}.`);
      console.log(`  Channel: #${targetChannel.name}`);
      console.log(`  Timestamp: ${timestamp}`);
    } else {
      console.error("Failed to edit message:", result.error);
      process.exit(1);
    }
  } catch (error: any) {
    if (error.data?.error === "cant_update_message") {
      console.error(
        "Error: Cannot edit this message. You can only edit messages posted by the bot."
      );
    } else if (error.data?.error === "message_not_found") {
      console.error("Error: Message not found. Check the timestamp.");
    } else {
      console.error("Error editing message:", error.data?.error || error);
    }
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith("edit.ts") || process.argv[1]?.endsWith("edit.js")) {
  edit();
}
