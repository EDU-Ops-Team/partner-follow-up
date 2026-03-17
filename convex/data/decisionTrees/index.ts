/**
 * Decision Trees
 *
 * Each tree is a set of nodes. The engine starts at `rootNode` and
 * traverses condition nodes until it reaches an action node.
 *
 * Condition nodes evaluate a field against a value using an operator.
 * Action nodes specify what the agent should do.
 */

export interface ConditionNode {
  type: "condition";
  nodeId: string;
  field: string;
  operator: "equals" | "not_equals" | "in" | "not_in" | "gt" | "lt" | "gte" | "exists" | "not_exists";
  value: unknown;
  trueNode: string;
  falseNode: string;
}

export interface ActionNode {
  type: "action";
  nodeId: string;
  action: "draft_reply" | "send_template" | "escalate" | "no_action" | "archive";
  tier?: 1 | 2;
  templateId?: string;
  reason: string;
}

export type TreeNode = ConditionNode | ActionNode;

export interface DecisionTree {
  id: string;
  version: string;
  description: string;
  rootNode: string;
  nodes: Record<string, TreeNode>;
}

/**
 * Email Triage Tree
 *
 * Root-level routing. Takes a classified email and decides what to do
 * based on classification type, confidence, and context.
 */
export const EMAIL_TRIAGE_TREE: DecisionTree = {
  id: "email-triage",
  version: "1.0.0",
  description: "Routes classified emails to the appropriate action based on type",
  rootNode: "check_auto_reply",
  nodes: {
    // Filter out auto-replies immediately
    check_auto_reply: {
      type: "condition",
      nodeId: "check_auto_reply",
      field: "classification.classificationType",
      operator: "equals",
      value: "auto_reply",
      trueNode: "action_archive",
      falseNode: "check_internal",
    },
    action_archive: {
      type: "action",
      nodeId: "action_archive",
      action: "archive",
      reason: "Auto-reply detected, no action needed",
    },

    // Internal emails: log only
    check_internal: {
      type: "condition",
      nodeId: "check_internal",
      field: "classification.classificationType",
      operator: "in",
      value: ["internal_fyi", "internal_action_needed"],
      trueNode: "action_no_action_internal",
      falseNode: "check_zoning_permit",
    },
    action_no_action_internal: {
      type: "action",
      nodeId: "action_no_action_internal",
      action: "no_action",
      reason: "Internal email, classified and logged only",
    },

    // Zoning and permit: classify but no agent action (deferred to humans)
    check_zoning_permit: {
      type: "condition",
      nodeId: "check_zoning_permit",
      field: "classification.classificationType",
      operator: "in",
      value: ["government_zoning", "government_permit"],
      trueNode: "action_no_action_zoning",
      falseNode: "check_invoice",
    },
    action_no_action_zoning: {
      type: "action",
      nodeId: "action_no_action_zoning",
      action: "no_action",
      reason: "Zoning/permit email — deferred to human handling",
    },

    // Invoice: hold for review (never auto-process)
    check_invoice: {
      type: "condition",
      nodeId: "check_invoice",
      field: "classification.classificationType",
      operator: "equals",
      value: "vendor_invoice",
      trueNode: "action_draft_invoice_hold",
      falseNode: "check_inspection_report",
    },
    action_draft_invoice_hold: {
      type: "action",
      nodeId: "action_draft_invoice_hold",
      action: "draft_reply",
      tier: 2,
      templateId: "g05_invoice_no_approval",
      reason: "Invoice received — hold for human review before processing",
    },

    // Inspection report received
    check_inspection_report: {
      type: "condition",
      nodeId: "check_inspection_report",
      field: "classification.classificationType",
      operator: "equals",
      value: "inspection_report",
      trueNode: "action_report_received",
      falseNode: "check_vendor_scheduling",
    },
    action_report_received: {
      type: "action",
      nodeId: "action_report_received",
      action: "send_template",
      tier: 1,
      templateId: "t05_inspection_report_clean",
      reason: "Inspection report received — distribute internally",
    },

    // Partner scheduling update
    check_vendor_scheduling: {
      type: "condition",
      nodeId: "check_vendor_scheduling",
      field: "classification.classificationType",
      operator: "equals",
      value: "vendor_scheduling",
      trueNode: "action_acknowledge_scheduling",
      falseNode: "check_vendor_completion",
    },
    action_acknowledge_scheduling: {
      type: "action",
      nodeId: "action_acknowledge_scheduling",
      action: "draft_reply",
      tier: 2,
      reason: "Partner scheduling update — draft acknowledgment for review",
    },

    // Partner completion
    check_vendor_completion: {
      type: "condition",
      nodeId: "check_vendor_completion",
      field: "classification.classificationType",
      operator: "equals",
      value: "vendor_completion",
      trueNode: "action_acknowledge_completion",
      falseNode: "check_vendor_question",
    },
    action_acknowledge_completion: {
      type: "action",
      nodeId: "action_acknowledge_completion",
      action: "draft_reply",
      tier: 2,
      reason: "Partner completion update — draft acknowledgment for review",
    },

    // Partner question
    check_vendor_question: {
      type: "condition",
      nodeId: "check_vendor_question",
      field: "classification.classificationType",
      operator: "equals",
      value: "vendor_question",
      trueNode: "action_draft_answer",
      falseNode: "check_unknown",
    },
    action_draft_answer: {
      type: "action",
      nodeId: "action_draft_answer",
      action: "draft_reply",
      tier: 2,
      reason: "Partner question — draft answer for human review",
    },

    // Unknown / catch-all
    check_unknown: {
      type: "condition",
      nodeId: "check_unknown",
      field: "classification.classificationType",
      operator: "equals",
      value: "unknown",
      trueNode: "action_flag_unknown",
      falseNode: "action_flag_unknown",
    },
    action_flag_unknown: {
      type: "action",
      nodeId: "action_flag_unknown",
      action: "escalate",
      reason: "Could not determine action — escalate to human",
    },
  },
};

/**
 * Follow-up Timer Tree
 *
 * Determines what follow-up action to take when a thread's timer fires.
 * Used by the checkEscalations cron.
 */
export const FOLLOWUP_TREE: DecisionTree = {
  id: "followup-timer",
  version: "1.0.0",
  description: "Determines follow-up action when a thread timer fires",
  rootNode: "check_days_waiting",
  nodes: {
    // If a partner has been non-responsive for 5+ business days, escalate
    check_days_waiting: {
      type: "condition",
      nodeId: "check_days_waiting",
      field: "thread.businessDaysSinceLastMessage",
      operator: "gte",
      value: 5,
      trueNode: "action_escalated_followup",
      falseNode: "action_standard_followup",
    },
    action_escalated_followup: {
      type: "action",
      nodeId: "action_escalated_followup",
      action: "send_template",
      tier: 2,
      templateId: "t03_vendor_followup_escalated",
      reason: "Partner non-responsive 5+ business days — escalated follow-up",
    },
    action_standard_followup: {
      type: "action",
      nodeId: "action_standard_followup",
      action: "send_template",
      tier: 1,
      templateId: "t02_vendor_followup_noncritical",
      reason: "Standard 2-business-day follow-up",
    },
  },
};

// ── Tree Registry ──

export const ALL_TREES: DecisionTree[] = [
  EMAIL_TRIAGE_TREE,
  FOLLOWUP_TREE,
];

export function getTreeById(id: string): DecisionTree | undefined {
  return ALL_TREES.find((t) => t.id === id);
}
