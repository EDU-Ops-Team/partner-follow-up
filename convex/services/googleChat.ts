"use node";

import { logger } from "../lib/logger";
import { withRetry } from "../lib/retry";

export async function postToChat(webhookUrl: string, text: string): Promise<void> {
  // TEMPORARY: Chat notifications disabled during reply system redevelopment
  console.log(`[CHAT DISABLED] Would have posted: ${text.slice(0, 200)}`);
  return;

  await withRetry(async () => {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Chat webhook failed: ${res.status} - ${body}`);
    }
    logger.info("Posted to Google Chat", { textLength: text.length });
  }, { maxRetries: 2, context: "google-chat-post" });
}
