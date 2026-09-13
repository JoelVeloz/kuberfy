import type { DeploymentStatus } from "@/lib/types";

// Single source so the table, filters and detail panels agree on labels/variants
export const deploymentStatusLabel: Record<DeploymentStatus, string> = {
  pending: "Pending",
  building: "Building",
  running: "Running",
  failed: "Failed",
  stopped: "Stopped",
};

export const deploymentStatusVariant: Record<DeploymentStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  building: "secondary",
  running: "default",
  failed: "destructive",
  stopped: "outline",
};

export const allDeploymentStatuses: DeploymentStatus[] = ["pending", "building", "running", "failed", "stopped"];
