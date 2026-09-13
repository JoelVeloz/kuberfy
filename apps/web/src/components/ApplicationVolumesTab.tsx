import { Card, CardContent } from "@/components/ui/card";
import { AddVolumeDialog, VolumesCard } from "@/components/VolumesCard";
import type { ApiApplicationDetail } from "@/lib/api";

// Persistent named-volume mounts for this application.
export function VolumesContent({ app }: { app: ApiApplicationDetail }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-heading text-sm font-medium">Volumes</h2>
          <p className="mt-1 text-xs text-muted-foreground">Storage that survives redeploys and restarts, mounted at a path inside the container.</p>
        </div>
        <AddVolumeDialog applicationId={app.id} />
      </div>
      <Card className="mt-3">
        <CardContent>
          <VolumesCard applicationId={app.id} volumes={app.volumes} />
        </CardContent>
      </Card>
    </>
  );
}
