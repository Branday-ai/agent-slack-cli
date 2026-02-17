import { WebClient } from "@slack/web-api";
import { readFileSync } from "fs";
import { extname } from "path";
import {
  slackConfig,
  validateConfig,
  getPostingToken,
  resolveAgent,
  resolveChannel,
} from "./config.js";
import { formatForSlack } from "./format.js";

validateConfig();

const BINARY_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".pdf", ".zip", ".tar", ".gz", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"];

export async function upload() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    const hasAgentTokens = Object.keys(slackConfig.agentTokens).length > 0;
    const agentFlag = hasAgentTokens ? " --as <agent>" : "";
    console.log(`Usage: pnpm slack:upload <filepath>${agentFlag} [--message <comment>] [--channel <name>]`);
    console.log("");
    console.log("Options:");
    if (hasAgentTokens) {
      const agents = Object.keys(slackConfig.agentTokens).join(", ");
      console.log(`  --as <agent>      Agent uploading the file (${agents})`);
    }
    console.log(
      "  --channel <name>  Channel to upload to (default: " + slackConfig.defaultChannel + ")"
    );
    console.log("  --message <text>  Comment to include with the upload");
    console.log("");
    console.log("Available channels:");
    for (const ch of slackConfig.channels) {
      const isDefault = ch.name === slackConfig.defaultChannel ? " (default)" : "";
      console.log(`  ${ch.name}${isDefault}`);
    }
    process.exit(1);
  }

  let filePath = "";
  let comment = "";
  let channelName: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--channel" && args[i + 1]) {
      channelName = args[i + 1];
      i++;
    } else if (args[i] === "--message" && args[i + 1]) {
      comment = args[i + 1];
      i++;
    } else if (args[i] === "--as" && args[i + 1]) {
      i++; // Skip, handled by resolveAgent
    } else if (!filePath) {
      filePath = args[i];
    } else if (!comment) {
      comment = args[i];
    }
  }

  const agentName = resolveAgent(args);

  if (!filePath) {
    console.error("Error: File path is required");
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

  const targetChannel = resolveChannel(channelName);

  const filename = filePath.split("/").pop() || "file";
  const ext = extname(filename).toLowerCase();
  const isBinary = BINARY_EXTENSIONS.includes(ext);

  const uploadComment = formatForSlack(comment || `Transmitting ${filename}`);

  let result;
  if (isBinary) {
    const fileData = readFileSync(filePath);
    result = await client.files.uploadV2({
      channel_id: targetChannel.id,
      filename,
      file: fileData,
      initial_comment: uploadComment,
    });
  } else {
    const content = readFileSync(filePath, "utf-8");
    result = await client.files.uploadV2({
      channel_id: targetChannel.id,
      filename,
      content,
      initial_comment: uploadComment,
    });
  }

  if (result.ok) {
    const agentLabel = agentName ? ` as ${agentName}` : "";
    console.log(`Upload successful${agentLabel}.`);
    console.log(`  Channel: #${targetChannel.name}`);
  } else {
    console.error("Upload failed:", result.error);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith("upload.ts") || process.argv[1]?.endsWith("upload.js")) {
  upload().catch(console.error);
}
