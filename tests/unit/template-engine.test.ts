import { describe, it, expect } from "vitest";
import { populateEmail } from "../../convex/services/templateEngine";

describe("populateEmail", () => {
  it("populates template variables", () => {
    const result = populateEmail("e01_scheduling_reminder", {
      site: {
        address: "835 Oak Creek Drive",
        responsiblePartyName: "John Smith",
        responsiblePartyEmail: "john@example.com",
        lidarScheduledStatus: "No",
        inspectionScheduledStatus: "Yes",
      },
      reminderCount: 3,
      businessDaysSince: 6,
    });

    expect(result).not.toBeNull();
    expect(result!.subject).toContain("835 Oak Creek Drive");
    expect(result!.subject).toContain("Reminder #3");
    expect(result!.body).toContain("John Smith");
    expect(result!.body).toContain("6 business days");
    expect(result!.body).toContain("EDU Ops Team");
    expect(result!.to).toBe("john@example.com");
    expect(result!.cc).toContain("auth.permitting@trilogy.com");
  });

  it("populates landlord questionnaire template", () => {
    const result = populateEmail("t01_landlord_questionnaire", {
      site: {
        address: "100 Main Street",
        responsiblePartyName: "Jane Broker",
        responsiblePartyEmail: "jane@realty.com",
      },
    });

    expect(result).not.toBeNull();
    expect(result!.body).toContain("shell drawings");
    expect(result!.body).toContain("Signage/Design Guidelines");
    expect(result!.body).toContain("sub-metered");
    expect(result!.tier).toBe(1);
    expect(result!.to).toBe("jane@realty.com");
  });

  it("populates tax exempt response", () => {
    const result = populateEmail("t06_tax_exempt", {
      email: { subject: "Tax exempt status?" },
    });

    expect(result).not.toBeNull();
    expect(result!.subject).toBe("Re: Tax exempt status?");
    expect(result!.body).toContain("not tax exempt");
    expect(result!.tier).toBe(1);
  });

  it("populates entity name with zip code", () => {
    const result = populateEmail("t07_entity_name", {
      site: { zipCode: "78701" },
      email: { subject: "Entity name?" },
    });

    expect(result).not.toBeNull();
    expect(result!.body).toContain("Alpha School 78701, LLC");
    expect(result!.body).toContain("no 's'");
  });

  it("handles conditional blocks", () => {
    const withDueDate = populateEmail("e03_inspection_report_reminder", {
      site: {
        address: "100 Main St",
        inspectionContactName: "Steve",
        reportDueDate: "March 15, 2026",
      },
      reminderCount: 1,
    });
    expect(withDueDate!.body).toContain("March 15, 2026");

    const withoutDueDate = populateEmail("e03_inspection_report_reminder", {
      site: {
        address: "100 Main St",
        inspectionContactName: "Steve",
      },
      reminderCount: 1,
    });
    expect(withoutDueDate!.body).not.toContain("Due Date:");
  });

  it("returns null for unknown template", () => {
    const result = populateEmail("nonexistent_template", {});
    expect(result).toBeNull();
  });

  it("uses vendor contact email as fallback recipient", () => {
    const result = populateEmail("t02_vendor_followup_noncritical", {
      vendor: {
        contactName: "Steve Hehl",
        contactEmail: "steve@worksmith.com",
      },
      site: { address: "100 Main St" },
      email: { subject: "Scheduling update" },
    });

    expect(result).not.toBeNull();
    expect(result!.to).toBe("steve@worksmith.com");
  });

  it("uses defaultTo from template when set", () => {
    const result = populateEmail("e03_inspection_report_reminder", {
      site: {
        address: "100 Main St",
        inspectionContactName: "Steve",
      },
      reminderCount: 1,
    });

    expect(result).not.toBeNull();
    expect(result!.to).toBe("alpha@worksmith.com");
  });

  it("invoice template is tier 2", () => {
    const result = populateEmail("g05_invoice_no_approval", {
      email: { subject: "Invoice #12345" },
    });

    expect(result).not.toBeNull();
    expect(result!.tier).toBe(2);
    expect(result!.body).toContain("review this before processing");
  });
});
