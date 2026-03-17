import { internalMutation } from "./_generated/server";
import { similarity } from "./lib/addressNormalizer";
import { ADDRESS_MATCH_THRESHOLD } from "./lib/constants";

function addressesMatch(a: string, b: string): boolean {
  // Exact match
  if (a === b) return true;
  // Prefix match (handles truncated addresses)
  if (a.startsWith(b) || b.startsWith(a)) return true;
  // Fuzzy match
  return similarity(a, b) >= ADDRESS_MATCH_THRESHOLD;
}

/**
 * One-off migration: deduplicate sites by address and convert
 * triggerEmailId/ThreadId/MessageId → triggerEmails[] array.
 *
 * Run via Convex dashboard: internal.migrateSites.run
 */
export const run = internalMutation({
  handler: async (ctx) => {
    const allSites = await ctx.db.query("sites").collect();

    // Group sites by normalizedAddress (exact match first)
    const groups = new Map<string, typeof allSites>();
    const assigned = new Set<string>();

    for (const site of allSites) {
      if (assigned.has(site._id)) continue;

      const key = site.normalizedAddress;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(site);
      assigned.add(site._id);
    }

    // Second pass: merge groups that fuzzy-match each other
    const groupKeys = [...groups.keys()];
    for (let i = 0; i < groupKeys.length; i++) {
      for (let j = i + 1; j < groupKeys.length; j++) {
        if (addressesMatch(groupKeys[i], groupKeys[j])) {
          // Merge group j into group i
          const sitesJ = groups.get(groupKeys[j])!;
          groups.get(groupKeys[i])!.push(...sitesJ);
          groups.delete(groupKeys[j]);
          groupKeys.splice(j, 1);
          j--;
        }
      }
    }

    let merged = 0;
    let converted = 0;

    for (const [, sitesInGroup] of groups) {
      // Pick canonical site: prefer one with fullAddress, most data
      const canonical = sitesInGroup.reduce((best, site) => {
        let score = 0;
        if (site.fullAddress) score += 10;
        if (site.lidarScheduled) score += 5;
        if (site.inspectionScheduled) score += 5;
        if (site.reportReceived) score += 5;
        if (site.phase === "completion") score += 3;
        if (site.phase === "resolved") score += 6;

        let bestScore = 0;
        if (best.fullAddress) bestScore += 10;
        if (best.lidarScheduled) bestScore += 5;
        if (best.inspectionScheduled) bestScore += 5;
        if (best.reportReceived) bestScore += 5;
        if (best.phase === "completion") bestScore += 3;
        if (best.phase === "resolved") bestScore += 6;

        return score > bestScore ? site : best;
      });

      // Build triggerEmails array from all sites in group
      const triggerEmails: Array<{
        emailId: string;
        threadId?: string;
        messageId?: string;
        receivedAt: number;
      }> = [];

      for (const site of sitesInGroup) {
        if (site.triggerEmailId) {
          triggerEmails.push({
            emailId: site.triggerEmailId,
            threadId: site.triggerThreadId ?? undefined,
            messageId: site.triggerMessageId ?? undefined,
            receivedAt: site.triggerDate,
          });
        }
        // Also carry over any already-migrated triggerEmails
        if (site.triggerEmails) {
          triggerEmails.push(...site.triggerEmails);
        }
      }

      // Dedup trigger emails by emailId
      const seen = new Set<string>();
      const dedupedTriggers = triggerEmails.filter((t) => {
        if (seen.has(t.emailId)) return false;
        seen.add(t.emailId);
        return true;
      });

      // Update canonical site
      await ctx.db.patch(canonical._id, {
        triggerEmails: dedupedTriggers,
        // Use earliest trigger date
        triggerDate: Math.min(...sitesInGroup.map((s) => s.triggerDate)),
      });
      converted++;

      // Rewrite foreign keys and delete duplicates
      const duplicateIds = sitesInGroup
        .filter((s) => s._id !== canonical._id)
        .map((s) => s._id);

      for (const dupId of duplicateIds) {
        // Rewrite emailClassifications.matchedSiteIds
        const classifications = await ctx.db
          .query("emailClassifications")
          .collect();
        for (const c of classifications) {
          if (c.matchedSiteIds.includes(dupId)) {
            const newIds = c.matchedSiteIds
              .map((id) => (id === dupId ? canonical._id : id))
              .filter((id, idx, arr) => arr.indexOf(id) === idx);
            await ctx.db.patch(c._id, { matchedSiteIds: newIds });
          }
        }

        // Rewrite emailThreads.linkedSiteIds
        const threads = await ctx.db.query("emailThreads").collect();
        for (const t of threads) {
          if (t.linkedSiteIds.includes(dupId)) {
            const newIds = t.linkedSiteIds
              .map((id) => (id === dupId ? canonical._id : id))
              .filter((id, idx, arr) => arr.indexOf(id) === idx);
            await ctx.db.patch(t._id, { linkedSiteIds: newIds });
          }
        }

        // Rewrite processedMessages.siteId
        const pms = await ctx.db
          .query("processedMessages")
          .withIndex("by_siteId", (q) => q.eq("siteId", dupId))
          .collect();
        for (const pm of pms) {
          await ctx.db.patch(pm._id, { siteId: canonical._id });
        }

        // Rewrite auditLogs.siteId
        const logs = await ctx.db
          .query("auditLogs")
          .withIndex("by_siteId", (q) => q.eq("siteId", dupId))
          .collect();
        for (const log of logs) {
          await ctx.db.patch(log._id, { siteId: canonical._id });
        }

        // Rewrite draftEmails.siteId
        const drafts = await ctx.db
          .query("draftEmails")
          .withIndex("by_siteId", (q) => q.eq("siteId", dupId))
          .collect();
        for (const d of drafts) {
          await ctx.db.patch(d._id, { siteId: canonical._id });
        }

        // Delete duplicate
        await ctx.db.delete(dupId);
        merged++;
      }
    }

    return {
      totalSites: allSites.length,
      groupsFound: groups.size,
      duplicatesMerged: merged,
      sitesConverted: converted,
    };
  },
});
