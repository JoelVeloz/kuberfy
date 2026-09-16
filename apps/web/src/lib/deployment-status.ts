import type { DeploymentStatus } from "@/lib/types";

// Single source so the table, filters and detail panels agree on labels/variants
export const deploymentStatusLabel: Record<DeploymentStatus, string> = {
  pending: "Pending",
  building: "Building",
  running: "Running",
  failed: "Failed",
  stopped: "Stopped",
};

export const deploymentStatusVariant: Record<DeploymentStatus, "secondary" | "success" | "destructive" | "outline" | "warning"> = {
  pending: "outline",
  building: "warning",
  running: "success",
  failed: "destructive",
  stopped: "outline",
};

// Shared "still deploying" signal — starting/building, before a deployment lands on running/failed/stopped
const inProgressStatuses = new Set<DeploymentStatus>(["pending", "building"]);
export const isDeploymentInProgress = (status: DeploymentStatus) => inProgressStatuses.has(status);
