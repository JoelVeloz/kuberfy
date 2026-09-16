import type * as React from "react";
import { Copy, Robot } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryProvider } from "@/components/QueryProvider";
import { api } from "@/lib/api";

function ClaudeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  );
}

function CursorIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
      <path d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" />
    </svg>
  );
}

function VsCodeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
      <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" />
    </svg>
  );
}

const TOOLS = [
  { name: "list_projects", description: "List every project, with each one's id." },
  { name: "create_project", description: "Create a new, empty project." },
  { name: "list_app_sizes", description: "List the CPU/memory tiers available for an application." },
  { name: "create_application", description: "Create an application inside a project, from an image or a git repository." },
  { name: "deploy_application", description: "Start or redeploy an application that was already created." },
];

function cursorInstallUrl(mcpUrl: string, token: string) {
  const config = btoa(JSON.stringify({ url: mcpUrl, headers: { Authorization: `Bearer ${token}` } }));
  return `https://cursor.com/install-mcp?name=kuberfy&config=${config}`;
}

function vscodeInstallUrl(mcpUrl: string, token: string) {
  const config = encodeURIComponent(
    JSON.stringify({ type: "http", url: mcpUrl, headers: { Authorization: `Bearer ${token}` } }),
  );
  return `https://insiders.vscode.dev/redirect/mcp/install?name=kuberfy&config=${config}`;
}

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

const tileClass =
  "flex flex-col items-center justify-center gap-2 border border-border bg-background px-3 py-4 text-xs font-medium text-foreground transition-colors hover:bg-muted";

function ConnectLinkTile({ icon, label, href }: { icon: React.ReactNode; label: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={tileClass}>
      {icon}
      {label}
    </a>
  );
}

function ConnectDialogTile({
  icon,
  label,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className={tileClass}>
          {icon}
          {label}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
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
  const bearerToken = token.data?.token ?? "";
  const command = `claude mcp add --transport http kuberfy ${mcpUrl} --header "Authorization: Bearer ${bearerToken}"`;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Connect</h2>
            <p className="text-xs text-muted-foreground">This instance's own MCP endpoint — runs as part of kuberfy itself, nothing to install or clone.</p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ConnectLinkTile icon={<CursorIcon />} label="Cursor" href={cursorInstallUrl(mcpUrl, bearerToken)} />
            <ConnectLinkTile icon={<VsCodeIcon />} label="VS Code" href={vscodeInstallUrl(mcpUrl, bearerToken)} />
            <ConnectDialogTile icon={<ClaudeIcon />} label="Claude Code" title="Claude Code" description="Run this in your terminal.">
              <CopyBlock text={command} />
            </ConnectDialogTile>
            <ConnectDialogTile
              icon={<Robot className="size-4" />}
              label="Other"
              title="Any other MCP client"
              description="Point it at this URL, with this header."
            >
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-foreground">Server URL</span>
                  <CopyBlock text={mcpUrl} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-foreground">Header</span>
                  <CopyBlock text={`Authorization: Bearer ${bearerToken}`} />
                </div>
              </div>
            </ConnectDialogTile>
          </div>
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
