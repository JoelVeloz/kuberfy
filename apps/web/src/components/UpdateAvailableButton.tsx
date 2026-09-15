import { ArrowsClockwise, CloudArrowDown } from "@phosphor-icons/react";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { UpdateConfirmDialog } from "@/components/UpdateConfirmDialog";
import { useKuberfyUpdate } from "@/lib/use-kuberfy-update";

// Sidebar footer counterpart to UpdateCard — only renders once a check confirms an update is actually available.
export function UpdateAvailableButton() {
  const { state, confirmOpen, setConfirmOpen, updating, restarting, update } = useKuberfyUpdate();

  if (restarting) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton disabled tooltip="Restarting…">
            <ArrowsClockwise className="animate-spin" />
            <span>Restarting…</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  if (state !== "available") return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger asChild>
            <SidebarMenuButton tooltip="Update available" className="text-blue-500 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-400">
              <CloudArrowDown />
              <span>Update available</span>
            </SidebarMenuButton>
          </DialogTrigger>
          <UpdateConfirmDialog updating={updating} onConfirm={update} />
        </Dialog>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
