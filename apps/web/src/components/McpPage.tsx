import { Copy } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryProvider } from "@/components/QueryProvider";
import { api } from "@/lib/api";

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
  const token = useQuery({ queryKey: ["mcp-token"], queryFn: api.getMcpToken });

  if (settings.isPending || token.isPending) {
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
  const mcpUrl = host ? `https://${host}/api/mcp` : `http://${settings.data?.serverIp ?? "<your-server-ip>"}:3000/api/mcp`;
  const command = `claude mcp add --transport http kuberfy ${mcpUrl} --header "Authorization: Bearer ${token.data?.token}"`;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Connect</h2>
          <p className="text-xs text-muted-foreground">This instance's own MCP endpoint — runs as part of kuberfy itself, nothing to install or clone.</p>
          <CopyBlock text={command} />
          <p className="text-xs text-muted-foreground">
            For a different MCP client, point it at <span className="font-mono text-foreground">{mcpUrl}</span> with header{" "}
            <span className="font-mono text-foreground">Authorization: Bearer {token.data?.token}</span>.
          </p>
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
