import { WebClient } from "@slack/web-api";
import {
  slackConfig,
  validateConfig,
  getPostingToken,
  resolveAgent,
  resolveChannel,
} from "./config.js";

validateConfig();

export async function deleteMessage(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    const hasAgentTokens = Object.keys(slackConfig.agentTokens).length > 0;
    const agentFlag = hasAgentTokens ? " [--as <agent>]" : "";
    console.log(`Usage: pnpm slack:delete <timestamp>${agentFlag} [--channel <name>]`);
    console.log("");
    console.log("Examples:");
    console.log("  pnpm slack:delete 1768822580.458979");
    console.log("  pnpm slack:delete 1768822580.458979 --channel pm-test");
    console.log("");
    console.log("Note: You can only delete messages posted by the bot.");
    process.exit(1);
  }

  let timestamp = "";
  let channelName: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--channel" && args[i + 1]) {
      channelName = args[i + 1];
      i++;
    } else if (args[i] === "--as" && args[i + 1]) {
      i++; // Skip, handled by resolveAgent
    } else {
      timestamp = args[i];
    }
  }

  const agentName = resolveAgent(args);

  if (!timestamp) {
    console.error("Error: Timestamp is required");
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
    const result = await client.chat.delete({
      channel: targetChannel.id,
      ts: timestamp,
    });

    if (result.ok) {
      const agentLabel = agentName ? ` as ${agentName}` : "";
      console.log(`Message deleted successfully${agentLabel}.`);
      console.log(`  Channel: #${targetChannel.name}`);
      console.log(`  Timestamp: ${timestamp}`);
    } else {
      console.error("Failed to delete message:", result.error);
      process.exit(1);
    }
  } catch (error: any) {
    if (error.data?.error === "cant_delete_message") {
      console.error(
        "Error: Cannot delete this message. You can only delete messages posted by the bot."
      );
    } else if (error.data?.error === "message_not_found") {
      console.error("Error: Message not found. Check the timestamp.");
    } else {
      console.error("Error deleting message:", error.data?.error || error);
    }
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith("delete.ts") || process.argv[1]?.endsWith("delete.js")) {
  deleteMessage();
}
