import * as React from "react";
import { Copy } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryProvider } from "@/components/QueryProvider";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

const TOOLS = [
  { name: "list_projects", description: "List every project, with each one's id." },
  { name: "create_project", description: "Create a new, empty project." },
  { name: "list_app_sizes", description: "List the CPU/memory tiers available for an application." },
  { name: "create_application", description: "Create an application inside a project, from an image or a git repository." },
  { name: "deploy_application", description: "Start or redeploy an application that was already created." },
];

function CopyBlock({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <pre className="max-w-full flex-1 overflow-x-auto whitespace-pre-wrap break-all border border-border bg-muted px-3 py-2 font-mono text-xs">{text}</pre>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          navigator.clipboard.writeText(text);
          toast.success("Copied.");
        }}
      >
        <Copy />
      </Button>
    </div>
  );
}

function McpPageInner() {
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  const { data: session } = authClient.useSession();

  if (settings.isPending) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  const host = settings.data?.kuberfyDomain;
  const baseUrl = host ? `https://${host}` : "http://<your-server-ip>:3000";
  const email = session?.user.email ?? "<your-email>";

  const command = `claude mcp add kuberfy \\
  -e KUBERFY_URL=${baseUrl} \\
  -e KUBERFY_EMAIL=${email} \\
  -e KUBERFY_PASSWORD=<your-password> \\
  -- bun run <path-to-kuberfy-repo>/apps/mcp/src/index.ts`;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">1. Clone kuberfy and install dependencies</h2>
          <p className="text-xs text-muted-foreground">The MCP server ships in the kuberfy repository itself, at apps/mcp — it isn't a separate download.</p>
          <CopyBlock text={"git clone https://github.com/JoelVeloz/kuberfy.git\ncd kuberfy && bun install"} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">2. Connect it to this instance</h2>
          <p className="text-xs text-muted-foreground">
            Replace <span className="font-mono">&lt;your-password&gt;</span> and <span className="font-mono">&lt;path-to-kuberfy-repo&gt;</span> below, then run it from anywhere.
          </p>
          <CopyBlock text={command} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Available tools</h2>
          <p className="text-xs text-muted-foreground">Deliberately minimal — everything needed to create and deploy projects/applications, nothing to delete or reconfigure them.</p>
          <ul className="flex flex-col gap-2">
            {TOOLS.map((t) => (
              <li key={t.name} className="flex flex-col gap-0.5 border-b border-border pb-2 text-xs last:border-b-0 last:pb-0">
                <span className="font-mono font-medium text-foreground">{t.name}</span>
                <span className="text-muted-foreground">{t.description}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export function McpPage() {
  return (
    <QueryProvider>
      <McpPageInner />
    </QueryProvider>
  );
}
