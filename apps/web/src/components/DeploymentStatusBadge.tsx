import { CircleNotchIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import type { DeploymentStatus } from "@/lib/types";
import { deploymentStatusLabel, deploymentStatusVariant, isDeploymentInProgress } from "@/lib/deployment-status";

// Single place rendering a deployment status badge, so color + spinner stay consistent everywhere one is shown
export function DeploymentStatusBadge({ status }: { status: DeploymentStatus }) {
  return (
    <Badge variant={deploymentStatusVariant[status]}>
      {isDeploymentInProgress(status) && <CircleNotchIcon className="animate-spin" weight="bold" />}
      {deploymentStatusLabel[status]}
    </Badge>
  );
}
