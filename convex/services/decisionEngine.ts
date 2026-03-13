"use node";

import { logger } from "../lib/logger";
import type {
  DecisionTree,
  TreeNode,
  ConditionNode,
  ActionNode,
} from "../data/decisionTrees/index";
import { getTreeById } from "../data/decisionTrees/index";

export interface DecisionContext {
  classification: {
    classificationType: string;
    confidence: number;
    extractedEntities: Record<string, unknown>;
    matchedSiteIds: string[];
    matchedVendorId?: string;
  };
  site?: {
    phase?: string;
    lidarScheduled?: boolean;
    inspectionScheduled?: boolean;
    reportReceived?: boolean;
    reportDueDate?: string;
    assignedDRI?: string;
  };
  thread?: {
    state?: string;
    messageCount?: number;
    businessDaysSinceLastMessage?: number;
  };
}

export interface TraversalStep {
  nodeId: string;
  condition: string;
  result: "true" | "false";
}

export interface DecisionResult {
  action: string;
  tier: number | null;
  templateId: string | null;
  reason: string;
  treeId: string;
  treeVersion: string;
  nodesTraversed: TraversalStep[];
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateCondition(node: ConditionNode, context: DecisionContext): boolean {
  const fieldValue = getNestedValue(context as unknown as Record<string, unknown>, node.field);

  switch (node.operator) {
    case "equals":
      return fieldValue === node.value;
    case "not_equals":
      return fieldValue !== node.value;
    case "in":
      return Array.isArray(node.value) && (node.value as unknown[]).includes(fieldValue);
    case "not_in":
      return Array.isArray(node.value) && !(node.value as unknown[]).includes(fieldValue);
    case "gt":
      return typeof fieldValue === "number" && typeof node.value === "number" && fieldValue > node.value;
    case "lt":
      return typeof fieldValue === "number" && typeof node.value === "number" && fieldValue < node.value;
    case "gte":
      return typeof fieldValue === "number" && typeof node.value === "number" && fieldValue >= node.value;
    case "exists":
      return fieldValue !== undefined && fieldValue !== null;
    case "not_exists":
      return fieldValue === undefined || fieldValue === null;
    default:
      logger.warn(`Unknown operator: ${node.operator}`);
      return false;
  }
}

/**
 * Execute a decision tree against the given context.
 * Returns the final action with the full traversal path.
 */
export function executeTree(
  treeId: string,
  context: DecisionContext
): DecisionResult {
  const tree = getTreeById(treeId);
  if (!tree) {
    logger.error(`Decision tree not found: ${treeId}`);
    return {
      action: "no_action",
      tier: null,
      templateId: null,
      reason: `Decision tree not found: ${treeId}`,
      treeId,
      treeVersion: "unknown",
      nodesTraversed: [],
    };
  }

  const traversal: TraversalStep[] = [];
  let currentNodeId = tree.rootNode;
  let iterations = 0;
  const maxIterations = 50; // Safety guard against infinite loops

  while (iterations < maxIterations) {
    iterations++;
    const node = tree.nodes[currentNodeId];

    if (!node) {
      logger.error(`Node not found: ${currentNodeId} in tree ${treeId}`);
      return {
        action: "no_action",
        tier: null,
        templateId: null,
        reason: `Node not found: ${currentNodeId}`,
        treeId: tree.id,
        treeVersion: tree.version,
        nodesTraversed: traversal,
      };
    }

    if (node.type === "action") {
      const actionNode = node as ActionNode;
      logger.info("Decision reached", {
        treeId: tree.id,
        action: actionNode.action,
        tier: actionNode.tier,
        templateId: actionNode.templateId,
        steps: traversal.length,
      });

      return {
        action: actionNode.action,
        tier: actionNode.tier ?? null,
        templateId: actionNode.templateId ?? null,
        reason: actionNode.reason,
        treeId: tree.id,
        treeVersion: tree.version,
        nodesTraversed: traversal,
      };
    }

    if (node.type === "condition") {
      const conditionNode = node as ConditionNode;
      const result = evaluateCondition(conditionNode, context);

      traversal.push({
        nodeId: conditionNode.nodeId,
        condition: `${conditionNode.field} ${conditionNode.operator} ${JSON.stringify(conditionNode.value)}`,
        result: result ? "true" : "false",
      });

      currentNodeId = result ? conditionNode.trueNode : conditionNode.falseNode;
    }
  }

  logger.error(`Max iterations reached in tree ${treeId}`);
  return {
    action: "no_action",
    tier: null,
    templateId: null,
    reason: "Max iterations reached — possible infinite loop in tree",
    treeId: tree.id,
    treeVersion: tree.version,
    nodesTraversed: traversal,
  };
}
