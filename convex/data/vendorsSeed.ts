/**
 * Initial vendor directory seed data.
 * Run via the vendors.seed mutation from the Convex dashboard.
 *
 * These are the most common vendors referenced across all four
 * contributor documents in the email-agent-consolidation.docx.
 */
export const INITIAL_VENDORS = [
  {
    name: "CDS (Corporate Development Services)",
    role: "Permitting and zoning due diligence",
    category: "permitting" as const,
    contacts: [
      { email: "info@cds-global.com", isPrimary: true },
    ],
    triggerConditions: "New site due diligence, CDS Initial Info requests",
    geographicScope: "National",
    defaultSLADays: 5,
  },
  {
    name: "Worksmith",
    role: "Building inspection scheduling and coordination",
    category: "inspection" as const,
    contacts: [
      { email: "alpha@worksmith.com", name: "Worksmith Alpha Team", isPrimary: true },
      { email: "shehl@worksmith.com", name: "Steve Hehl", isPrimary: false },
    ],
    triggerConditions: "New inspection needed, inspection scheduling",
    geographicScope: "National",
    defaultSLADays: 2,
  },
  {
    name: "Bench Architecture",
    role: "Architecture and design services",
    category: "architecture" as const,
    contacts: [
      { email: "info@bencharchitecture.com", isPrimary: true },
    ],
    geographicScope: "National",
    defaultSLADays: 5,
  },
  {
    name: "Apogee Consulting Group",
    role: "Engineering and consulting",
    category: "construction" as const,
    contacts: [
      { email: "info@apogeeconsultinggroup.com", isPrimary: true },
    ],
    geographicScope: "National",
    defaultSLADays: 5,
  },
  {
    name: "Turner & Townsend",
    role: "Project management and cost consulting",
    category: "construction" as const,
    contacts: [
      { email: "info@turnertownsend.com", isPrimary: true },
    ],
    triggerConditions: "Construction oversight, cost estimation",
    geographicScope: "National",
    defaultSLADays: 3,
  },
  {
    name: "RTL Real Estate",
    role: "Real estate and site acquisition",
    category: "other" as const,
    contacts: [
      { email: "info@rtlrealestate.com", isPrimary: true },
    ],
    geographicScope: "National",
    defaultSLADays: 3,
  },
  {
    name: "CTTS",
    role: "IT cabling and infrastructure",
    category: "it_cabling" as const,
    contacts: [
      { email: "info@ctts.com", isPrimary: true },
    ],
    geographicScope: "National",
    defaultSLADays: 5,
  },
  {
    name: "V2/Aldon",
    role: "IT cabling and infrastructure",
    category: "it_cabling" as const,
    contacts: [
      { email: "info@v2aldon.com", isPrimary: true },
    ],
    geographicScope: "National",
    defaultSLADays: 5,
  },
  {
    name: "Husch Blackwell",
    role: "Legal counsel — zoning, special exceptions, regulatory",
    category: "legal" as const,
    contacts: [
      { email: "info@huschblackwell.com", isPrimary: true },
    ],
    triggerConditions: "Special exception legal review, zoning appeals",
    geographicScope: "National",
    defaultSLADays: 5,
  },
  {
    name: "Jones Spross",
    role: "Legal counsel",
    category: "legal" as const,
    contacts: [
      { email: "info@jonesspross.com", isPrimary: true },
    ],
    geographicScope: "TX",
    defaultSLADays: 5,
  },
  {
    name: "Gray Robinson",
    role: "Legal counsel",
    category: "legal" as const,
    contacts: [
      { email: "info@grayrobinson.com", isPrimary: true },
    ],
    geographicScope: "FL",
    defaultSLADays: 5,
  },
];
