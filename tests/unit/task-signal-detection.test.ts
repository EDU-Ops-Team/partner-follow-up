import { describe, expect, it } from "vitest";
import { detectTaskSignalFromMessage } from "../../convex/lib/taskSignalDetection";

describe("detectTaskSignalFromMessage", () => {
  const sites = [
    {
      _id: "site_oak",
      siteAddress: "995 Oak Creek Drive",
      fullAddress: "995 Oak Creek Drive, Lombard, IL",
      responsiblePartyEmail: "trent@purewestmt.com",
    },
    {
      _id: "site_palm",
      siteAddress: "10350 Riverside Dr",
      fullAddress: "10350 Riverside Dr, Palm Beach Gardens, FL",
      responsiblePartyEmail: "owner@example.com",
      inspectionContactEmail: "inspector@example.com",
    },
  ];

  it("detects a building inspection deliverable from an attachment email", () => {
    const signal = detectTaskSignalFromMessage(sites, {
      subject: "NYC DOHMH - 3/29/26 Inspection Report",
      bodyText: "Attached is the report for 10350 Riverside Dr, Palm Beach Gardens, FL.",
      from: "Leslie M. Nunez <lnunez1@health.nyc.gov>",
      to: ["auth.permitting@trilogy.com", "owner@example.com"],
      cc: [],
      attachments: [{ name: "report.pdf", mimeType: "application/pdf" }],
    });

    expect(signal).toMatchObject({
      siteId: "site_palm",
      taskType: "building_inspection",
      proposedState: "in_review",
      partnerKey: "worksmith",
    });
    expect(signal?.confidence).toBeGreaterThan(0.8);
  });

  it("detects a lidar scheduling email from the site participant chain", () => {
    const signal = detectTaskSignalFromMessage(sites, {
      subject: "Re: bozeman",
      bodyText: "Would it be crazy to get the Lidar and inspection scheduled today?",
      from: "Robbie Forrest <robbie.forrest@trilogy.com>",
      to: ["trent@purewestmt.com", "auth.permitting@trilogy.com"],
      cc: ["zack.lamb@2hourlearning.com"],
      attachments: [],
    });

    expect(signal).toMatchObject({
      siteId: "site_oak",
      taskType: "lidar_scan",
      proposedState: "requested",
      partnerKey: "scanning_vendor",
    });
  });

  it("ignores unrelated messages without a site match", () => {
    const signal = detectTaskSignalFromMessage(sites, {
      subject: "City inspection newsletter",
      bodyText: "New inspection scheduling procedures are in effect citywide.",
      from: "raleighnc@info.raleighnc.gov",
      to: ["auth.permitting@trilogy.com"],
      cc: [],
      attachments: [],
    });

    expect(signal).toBeNull();
  });
});
