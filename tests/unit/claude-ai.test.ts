import { describe, expect, it } from "vitest";
import {
  buildDraftReplyPrompt,
  buildPrompt,
  parseResponse,
} from "../../convex/services/claudeAI";

const mockSiteContext = {
  siteAddress: "620 5th Avenue",
  fullAddress: "620 5th Ave S, Kirkland, WA, King County, USA, 98033",
  phase: "scheduling" as const,
  lidarScheduled: true,
  lidarScheduledDatetime: 1772832780000,
  lidarJobStatus: "Expired Contract",
  inspectionScheduled: false,
  reportReceived: false,
};

const mockAirtableData = {
  address: "620 5th Ave S, Kirkland, WA, King County, USA, 98033",
  scheduledDate: undefined,
  jobStatus: "Expired Contract",
  modelUrl: "https://my.matterport.com/show/?m=abc123",
};

const mockThreadHistory = [
  { from: "Zack Lamb <zack.lamb@2hourlearning.com>", date: "2026-03-06T10:00:00Z", body: "Please schedule LiDAR and inspection for 620 5th Ave." },
  { from: "auth.permitting@trilogy.com", date: "2026-03-08T14:00:00Z", body: "This is a reminder that scheduling is still incomplete." },
];

const mockPartnerReply = {
  from: "mshkreli@rtl-re.com",
  body: "When is the LiDAR scan scheduled? We need to coordinate access.",
};

describe("buildPrompt", () => {
  it("includes site status section", () => {
    const prompt = buildPrompt(mockSiteContext, mockAirtableData, mockThreadHistory, mockPartnerReply);
    expect(prompt).toContain("## Current Site Status");
    expect(prompt).toContain("620 5th Ave S, Kirkland, WA");
    expect(prompt).toContain("Phase: scheduling");
    expect(prompt).toContain("LiDAR Scheduled: Yes");
    expect(prompt).toContain("Expired Contract");
  });

  it("includes Airtable data section", () => {
    const prompt = buildPrompt(mockSiteContext, mockAirtableData, mockThreadHistory, mockPartnerReply);
    expect(prompt).toContain("## Latest Airtable Data");
    expect(prompt).toContain("Expired Contract");
    expect(prompt).toContain("matterport.com");
  });

  it("handles null Airtable data", () => {
    const prompt = buildPrompt(mockSiteContext, null, mockThreadHistory, mockPartnerReply);
    expect(prompt).toContain("No matching Airtable record found");
  });

  it("includes thread history", () => {
    const prompt = buildPrompt(mockSiteContext, mockAirtableData, mockThreadHistory, mockPartnerReply);
    expect(prompt).toContain("## Email Thread History");
    expect(prompt).toContain("[1] From: Zack Lamb");
    expect(prompt).toContain("[2] From: auth.permitting");
    expect(prompt).toContain("scheduling is still incomplete");
  });

  it("includes partner reply", () => {
    const prompt = buildPrompt(mockSiteContext, mockAirtableData, mockThreadHistory, mockPartnerReply);
    expect(prompt).toContain("## Partner Reply");
    expect(prompt).toContain("mshkreli@rtl-re.com");
    expect(prompt).toContain("coordinate access");
  });

  it("caps thread history to 10 messages", () => {
    const longHistory = Array.from({ length: 15 }, (_, i) => ({
      from: `user${i}@example.com`,
      date: `2026-03-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
      body: `Message ${i + 1}`,
    }));
    const prompt = buildPrompt(mockSiteContext, null, longHistory, mockPartnerReply);
    expect(prompt).not.toContain("Message 1\n");
    expect(prompt).not.toContain("[6] From: user0");
    expect(prompt).toContain("Message 15");
  });

  it("truncates long message bodies", () => {
    const longBody = "A".repeat(3000);
    const history = [{ from: "test@example.com", date: "2026-03-01T10:00:00Z", body: longBody }];
    const prompt = buildPrompt(mockSiteContext, null, history, mockPartnerReply);
    expect(prompt).not.toContain("A".repeat(3000));
    expect(prompt).toContain("...");
  });

  it("uses siteAddress when fullAddress is missing", () => {
    const noFullAddress = { ...mockSiteContext, fullAddress: undefined };
    const prompt = buildPrompt(noFullAddress, null, [], mockPartnerReply);
    expect(prompt).toContain("Address: 620 5th Avenue");
  });
});

describe("buildDraftReplyPrompt", () => {
  it("includes partner and site context for reply drafting", () => {
    const prompt = buildDraftReplyPrompt({
      classificationType: "vendor_question",
      subject: "Access for scan",
      bodyPreview: "Can we get access details for Tuesday?",
      from: "mshkreli@rtl-re.com",
      to: ["edu.ops@trilogy.com"],
      cc: ["zack.lamb@2hourlearning.com"],
      siteContext: mockSiteContext,
      threadHistory: mockThreadHistory,
      partner: {
        name: "RTL",
        category: "inspection",
        contactName: "Mira Shkreli",
        contactEmail: "mshkreli@rtl-re.com",
      },
    });

    expect(prompt).toContain("Draft a reply from EDU Ops Team for human review.");
    expect(prompt).toContain("## Current Inbound Email");
    expect(prompt).toContain("## Site Context");
    expect(prompt).toContain("## Partner Context");
    expect(prompt).toContain("Partner Name: RTL");
    expect(prompt).toContain("Access for scan");
  });
});

describe("parseResponse", () => {
  it("returns confident true for normal response", () => {
    const result = parseResponse("Thank you for your inquiry. The LiDAR scan is scheduled.");
    expect(result.confident).toBe(true);
    expect(result.response).toBe("Thank you for your inquiry. The LiDAR scan is scheduled.");
  });

  it("returns confident false and strips [UNCERTAIN] prefix", () => {
    const result = parseResponse("[UNCERTAIN] I'm not sure about the scheduling details.");
    expect(result.confident).toBe(false);
    expect(result.response).toBe("I'm not sure about the scheduling details.");
  });

  it("handles [UNCERTAIN] with leading whitespace", () => {
    const result = parseResponse("  [UNCERTAIN] This needs review.");
    expect(result.confident).toBe(false);
    expect(result.response).toBe("This needs review.");
  });

  it("does not flag [UNCERTAIN] in the middle of text", () => {
    const result = parseResponse("The status is [UNCERTAIN] at this time.");
    expect(result.confident).toBe(true);
    expect(result.response).toContain("[UNCERTAIN]");
  });

  it("trims whitespace from response", () => {
    const result = parseResponse("  Hello there.  ");
    expect(result.response).toBe("Hello there.");
  });
});
