export const TASK_TYPES = [
  "sir",
  "lidar_scan",
  "building_inspection",
] as const;

export const TASK_STATES = [
  "not_started",
  "requested",
  "scheduled",
  "in_progress",
  "in_review",
  "completed",
  "blocked",
  "not_needed",
] as const;

export const TASK_MILESTONES = ["M1"] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type TaskState = (typeof TASK_STATES)[number];
export type TaskMilestone = (typeof TASK_MILESTONES)[number];

export type TaskSummary = {
  taskType: TaskType;
  partnerKey: string;
  partnerName: string;
  milestone: TaskMilestone;
  state: TaskState;
  stateUpdatedAt: number;
  lastProgressValue: number;
  deliverableUrl?: string;
  scopeChanged?: boolean;
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  sir: "SIR",
  lidar_scan: "LiDAR Scan",
  building_inspection: "Building Inspection",
};

export const TASK_STATE_LABELS: Record<TaskState, string> = {
  not_started: "Not started",
  requested: "Requested",
  scheduled: "Scheduled",
  in_progress: "In progress",
  in_review: "In review",
  completed: "Completed",
  blocked: "Blocked",
  not_needed: "Not needed",
};

export const TASK_STATE_WEIGHTS: Record<TaskState, number> = {
  not_started: 0,
  requested: 15,
  scheduled: 30,
  in_progress: 50,
  in_review: 80,
  completed: 100,
  blocked: 0,
  not_needed: 100,
};

export const PHASE_ONE_TASK_TEMPLATES: Array<{
  taskType: TaskType;
  partnerKey: string;
  partnerName: string;
  milestone: TaskMilestone;
}> = [
  {
    taskType: "sir",
    partnerKey: "cds",
    partnerName: "CDS",
    milestone: "M1",
  },
  {
    taskType: "lidar_scan",
    partnerKey: "scanning_vendor",
    partnerName: "Scanning Vendor",
    milestone: "M1",
  },
  {
    taskType: "building_inspection",
    partnerKey: "worksmith",
    partnerName: "Worksmith",
    milestone: "M1",
  },
];

export interface SiteTaskStateInput {
  lidarScheduled?: boolean;
  lidarJobStatus?: string;
  inspectionScheduled?: boolean;
  reportReceived?: boolean;
  reportLink?: string;
}

export function getTaskProgressValue(state: TaskState, lastProgressValue?: number): number {
  if (state === "blocked") {
    return lastProgressValue ?? TASK_STATE_WEIGHTS.in_progress;
  }
  return TASK_STATE_WEIGHTS[state];
}

export function deriveTaskStateFromSite(
  taskType: Exclude<TaskType, "sir">,
  site: SiteTaskStateInput,
): TaskState {
  if (taskType === "lidar_scan") {
    if (isLidarComplete(site.lidarJobStatus)) {
      return "completed";
    }
    if (site.lidarScheduled) {
      return "scheduled";
    }
    return "requested";
  }

  if (site.reportReceived || site.reportLink) {
    return "completed";
  }
  if (site.inspectionScheduled) {
    return "scheduled";
  }
  return "requested";
}

export function isLidarComplete(jobStatus?: string): boolean {
  if (!jobStatus) return false;
  return ["complete", "completed", "done", "finished"].includes(jobStatus.toLowerCase().trim());
}

export function formatTaskTypeLabel(taskType: TaskType): string {
  return TASK_TYPE_LABELS[taskType];
}

export function formatTaskStateLabel(taskState: TaskState): string {
  return TASK_STATE_LABELS[taskState];
}

export function calculateProgress(tasks: TaskSummary[]) {
  const activeTasks = tasks.filter((task) => task.state !== "not_needed");
  if (activeTasks.length === 0) {
    return {
      percentComplete: 100,
      activeTaskCount: 0,
      completedTaskCount: 0,
      blockedTaskCount: 0,
      scopeChanged: false,
    };
  }

  const total = activeTasks.reduce((sum, task) => {
    return sum + getTaskProgressValue(task.state, task.lastProgressValue);
  }, 0);

  return {
    percentComplete: Math.round((total / activeTasks.length) * 10) / 10,
    activeTaskCount: activeTasks.length,
    completedTaskCount: activeTasks.filter((task) => task.state === "completed" || task.state === "not_needed").length,
    blockedTaskCount: activeTasks.filter((task) => task.state === "blocked").length,
    scopeChanged: activeTasks.some((task) => Boolean(task.scopeChanged)),
  };
}
