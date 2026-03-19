import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { loadCheckpoint, saveCheckpoint } from "./checkpoint.mjs";

function parseArgs(argv) {
  const args = {
    groupUrl: "",
    checkpoint: path.join(process.cwd(), ".local", "groups-backfill-checkpoint.json"),
    selectors: path.join(process.cwd(), "scripts", "groups-backfill", "selectors.example.json"),
    envFile: path.join(process.cwd(), ".env.local"),
    maxThreads: 25,
    batchSize: 5,
    headless: false,
    loginTimeoutMs: 120000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === "--group-url") args.groupUrl = next;
    if (token === "--checkpoint") args.checkpoint = next;
    if (token === "--selectors") args.selectors = next;
    if (token === "--env-file") args.envFile = next;
    if (token === "--max-threads") args.maxThreads = Number(next);
    if (token === "--batch-size") args.batchSize = Number(next);
    if (token === "--login-timeout-ms") args.loginTimeoutMs = Number(next);
    if (token === "--headless") args.headless = true;
  }

  if (!args.groupUrl) {
    throw new Error("Missing required --group-url");
  }

  return args;
}

function loadEnvFile(envFile) {
  const envText = fs.readFileSync(envFile, "utf8");
  const pairs = envText
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !line.trim().startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    });
  return Object.fromEntries(pairs);
}

function loadSelectors(selectorsPath) {
  return JSON.parse(fs.readFileSync(selectorsPath, "utf8"));
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    throw new Error(
      "Missing playwright dependency. Install it locally before running this scaffold, for example: npm install -D playwright",
    );
  }
}

async function writeDebugSnapshot(page, filePath) {
  const debug = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a"))
      .slice(0, 40)
      .map((link) => ({
        text: link.textContent?.trim() ?? "",
        href: link.getAttribute("href"),
      }));

    const attributes = Array.from(document.querySelectorAll("[data-thread-id], [data-message-id]"))
      .slice(0, 40)
      .map((element) => ({
        tag: element.tagName,
        dataThreadId: element.getAttribute("data-thread-id"),
        dataMessageId: element.getAttribute("data-message-id"),
        text: element.textContent?.trim()?.slice(0, 200) ?? "",
      }));

    return {
      url: window.location.href,
      title: document.title,
      links,
      attributes,
      bodyPreview: document.body?.innerText?.slice(0, 4000) ?? "",
      html: document.documentElement.outerHTML,
    };
  });

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(debug, null, 2));
}

function makeDebugPath(name) {
  return path.join(process.cwd(), ".local", name);
}

function splitAddressHeader(value) {
  if (!value) return [];
  return value
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function collectThreadSummaries(page, selectors) {
  return page.$$eval(selectors.threadListItem, (elements, selectorMap) => {
    const seen = new Set();
    return elements.flatMap((element, index) => {
      const link = element.matches(selectorMap.threadLink) ? element : element.querySelector(selectorMap.threadLink);
      const threadId = element.getAttribute("data-thread-id") ?? link?.getAttribute("href") ?? `thread-${index}`;
      const subject = element.getAttribute("data-thread-subject") ?? link?.textContent?.trim() ?? "Untitled thread";
      const href = link?.href ?? null;
      if (!href || seen.has(href)) {
        return [];
      }
      seen.add(href);
      return [{
        threadId,
        subject,
        href,
      }];
    });
  }, selectors);
}

async function extractThreadFromDataScript(page) {
  return page.evaluate(() => {
    const script = Array.from(document.scripts).find((node) => node.textContent?.includes("key: 'ds:11'"));
    if (!script?.textContent) {
      return null;
    }

    let callbackPayload = null;
    const AF_initDataCallback = (payload) => {
      callbackPayload = payload;
    };

    eval(script.textContent);

    const data = callbackPayload?.data;
    if (!Array.isArray(data)) {
      return null;
    }

    const isMessageMeta = (value) => Array.isArray(value)
      && typeof value[1] === "string"
      && Array.isArray(value[2])
      && typeof value[5] === "string"
      && Array.isArray(value[7]);

    const collectMessagePairs = (value, pairs = []) => {
      if (!Array.isArray(value)) {
        return pairs;
      }
      if (value.length >= 2 && isMessageMeta(value[0]) && Array.isArray(value[1])) {
        pairs.push([value[0], value[1]]);
      }
      for (const child of value) {
        collectMessagePairs(child, pairs);
      }
      return pairs;
    };

    const readHtml = (details) => {
      const htmlSection = Array.isArray(details?.[1]) ? details[1] : [];
      const htmlEntry = htmlSection.find((entry) => Array.isArray(entry) && entry[0] === 1 && Array.isArray(entry[1]));
      return htmlEntry?.[1]?.[1] ?? "";
    };

    const stripHtml = (html) => {
      if (!html) {
        return "";
      }
      try {
        const parsed = new DOMParser().parseFromString(html, "text/html");
        return parsed.body?.textContent?.trim() ?? "";
      } catch (error) {
        return html
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
    };

    const readAttachments = (details) => {
      const attachmentSection = Array.isArray(details?.[2]) ? details[2] : [];
      return attachmentSection
        .filter((entry) => Array.isArray(entry))
        .map((entry) => ({
          url: entry[0] ?? "",
          mimeType: entry[3] ?? "",
          name: entry[4] ?? "attachment",
          size: typeof entry[5] === "number" ? entry[5] : null,
        }))
        .filter((entry) => entry.url || entry.name);
    };

    const readRecipients = (metaRecipients) => {
      if (!Array.isArray(metaRecipients)) {
        return [];
      }
      return metaRecipients
        .map((recipient) => recipient?.[2] ?? recipient?.[0] ?? "")
        .filter(Boolean);
    };

    const pairs = collectMessagePairs(data);
    if (!pairs.length) {
      return null;
    }

    const messages = pairs.map(([meta, details], index) => {
      const sender = meta[2]?.[0];
      const recipients = meta[2]?.[1];
      const bodyHtml = readHtml(details);
      const bodyText = stripHtml(bodyHtml) || meta[6] || "";
      const timestamp = Array.isArray(meta[7]) ? meta[7] : [];
      const sentAt = typeof timestamp[0] === "number"
        ? (timestamp[0] * 1000) + Math.floor((timestamp[1] ?? 0) / 1000000)
        : Date.now();

      return {
        externalMessageId: meta[1] ?? `message-${index}`,
        from: sender?.[2] ?? sender?.[0] ?? "",
        to: readRecipients(recipients),
        cc: [],
        sentAt,
        subject: meta[5] ?? document.title,
        bodyText,
        bodyHtml,
        attachments: readAttachments(details),
      };
    });

    return {
      participants: Array.from(new Set(messages.flatMap((message) => [message.from, ...message.to, ...message.cc]).filter(Boolean))),
      messages,
      source: "data_script",
    };
  });
}

async function extractThread(page, threadSummary, selectors) {
  if (!threadSummary.href) {
    throw new Error(`Thread ${threadSummary.threadId} is missing an href. Update thread selectors.`);
  }

  await page.goto(threadSummary.href, { waitUntil: "domcontentloaded" });
  await writeDebugSnapshot(page, makeDebugPath("groups-thread-current.json"));

  const scriptedThread = await extractThreadFromDataScript(page);
  if (scriptedThread?.messages?.length) {
    return scriptedThread;
  }

  try {
    await page.waitForSelector(selectors.messageItem, { timeout: 15000 });
  } catch (error) {
    const safeThreadId = threadSummary.threadId.replace(/[^a-z0-9_-]+/gi, "_");
    const debugPath = makeDebugPath(`groups-thread-debug-${safeThreadId}.json`);
    if (!page.isClosed()) {
      await writeDebugSnapshot(page, debugPath);
    }
    throw new Error(
      `Could not find message selector '${selectors.messageItem}' in thread ${threadSummary.threadId}. Wrote debug snapshot to ${debugPath}.`,
    );
  }

  return page.$$eval(selectors.messageItem, (elements, selectorMap) => {
    const messages = elements.map((element, index) => {
      const readText = (selector) => element.querySelector(selector)?.textContent?.trim() ?? "";
      const bodyNode = element.querySelector(selectorMap.messageBody);
      const attachmentLinks = Array.from(element.querySelectorAll(selectorMap.attachmentLink)).map((link) => ({
        name: link.textContent?.trim() ?? "attachment",
        url: link.href,
      }));
      const externalMessageId = element.getAttribute("data-message-id") ?? `message-${index}`;
      const sentAtRaw = element.getAttribute("data-message-sent-at") ?? readText(selectorMap.messageTimestamp);
      const sentAt = Date.parse(sentAtRaw);

      return {
        externalMessageId,
        from: readText(selectorMap.messageFrom),
        to: readText(selectorMap.messageTo),
        cc: readText(selectorMap.messageCc),
        sentAt: Number.isFinite(sentAt) ? sentAt : Date.now(),
        subject: document.title,
        bodyText: bodyNode?.textContent?.trim() ?? "",
        bodyHtml: bodyNode?.innerHTML,
        attachments: attachmentLinks,
      };
    });

    return {
      participants: Array.from(new Set(messages.flatMap((message) => [message.from, message.to, message.cc].filter(Boolean)).flatMap((value) => value.split(/[,;]+/).map((part) => part.trim()).filter(Boolean)))),
      messages,
      source: "dom_fallback",
    };
  }, selectors);
}

async function ingestBatch(client, env, batch, checkpointKey) {
  return client.mutation(api.groupArchive.ingestBatch, {
    apiKey: env.ADMIN_API_KEY,
    threads: batch,
    scrapedAt: Date.now(),
    checkpointKey,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnvFile(args.envFile);
  const selectors = loadSelectors(args.selectors);
  const checkpoint = loadCheckpoint(args.checkpoint);

  if (!env.NEXT_PUBLIC_CONVEX_URL || !env.ADMIN_API_KEY) {
    throw new Error(".env.local must include NEXT_PUBLIC_CONVEX_URL and ADMIN_API_KEY");
  }

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: args.headless });
  const page = await browser.newPage();
  const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
  const processedThreadIds = new Set(checkpoint.processedThreadIds ?? []);
  const batch = [];

  try {
    await page.goto(args.groupUrl, { waitUntil: "domcontentloaded" });
    console.log("Waiting for Google Groups thread list. If login is required, complete it in the browser window.");
    try {
      await page.waitForSelector(selectors.threadListItem, { timeout: args.loginTimeoutMs });
    } catch (error) {
      const debugPath = makeDebugPath("groups-debug.json");
      if (!page.isClosed()) {
        await writeDebugSnapshot(page, debugPath);
      }
      throw new Error(`Could not find thread list selector '${selectors.threadListItem}'. Wrote debug snapshot to ${debugPath}.`);
    }

    let totalProcessed = 0;
    let hasNextPage = true;

    while (hasNextPage && totalProcessed < args.maxThreads) {
      const threadSummaries = await collectThreadSummaries(page, selectors);

      for (const threadSummary of threadSummaries) {
        if (totalProcessed >= args.maxThreads) {
          break;
        }
        if (processedThreadIds.has(threadSummary.threadId)) {
          continue;
        }

        const threadData = await extractThread(page, threadSummary, selectors);
        const normalizedMessages = threadData.messages.map((message) => ({
          externalMessageId: message.externalMessageId,
          from: message.from,
          to: Array.isArray(message.to) ? message.to : splitAddressHeader(message.to),
          cc: Array.isArray(message.cc) ? message.cc : splitAddressHeader(message.cc),
          sentAt: message.sentAt,
          subject: threadSummary.subject,
          bodyText: message.bodyText,
          bodyHtml: message.bodyHtml,
          attachments: message.attachments,
          sourceUrl: threadSummary.href,
        }));

        batch.push({
          groupThreadId: threadSummary.threadId,
          subject: threadSummary.subject,
          participants: threadData.participants,
          firstMessageAt: normalizedMessages[0]?.sentAt,
          lastMessageAt: normalizedMessages.at(-1)?.sentAt,
          sourceUrl: threadSummary.href,
          messages: normalizedMessages,
        });

        processedThreadIds.add(threadSummary.threadId);
        totalProcessed += 1;

        if (batch.length >= args.batchSize) {
          const result = await ingestBatch(client, env, batch.splice(0, batch.length), args.checkpoint);
          console.log(`Ingested batch: ${JSON.stringify(result)}`);
        }

        saveCheckpoint(args.checkpoint, {
          pageCursor: threadSummary.href,
          processedThreadIds: Array.from(processedThreadIds),
          lastRunAt: new Date().toISOString(),
        });

        await page.goto(args.groupUrl, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(selectors.threadListItem, { timeout: 15000 });
      }

      const nextButton = await page.$(selectors.nextPageButton);
      if (!nextButton || totalProcessed >= args.maxThreads) {
        hasNextPage = false;
      } else {
        await nextButton.click();
        await page.waitForLoadState("domcontentloaded");
      }
    }

    if (batch.length > 0) {
      const result = await ingestBatch(client, env, batch, args.checkpoint);
      console.log(`Ingested final batch: ${JSON.stringify(result)}`);
    }

    console.log(`Processed ${processedThreadIds.size} thread(s).`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});







