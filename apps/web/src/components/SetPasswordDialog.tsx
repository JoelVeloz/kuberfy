import * as React from "react";
import { ArrowClockwise, Copy } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { generatePassword } from "@/lib/utils";
import { toastError } from "@/lib/toast";

export function SetPasswordDialog({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState(generatePassword());
  const [applied, setApplied] = React.useState(false);

  const setPasswordMutation = useMutation({
    mutationFn: () => api.setUserPassword(userId, password),
    onSuccess: () => setApplied(true),
    onError: (err) => toastError(err, "Failed to set password."),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setPassword(generatePassword());
          setApplied(false);
          setPasswordMutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Reset password
        </Button>
      </DialogTrigger>
      <DialogContent>
        {applied ? (
          <>
            <DialogHeader>
              <DialogTitle>Password updated</DialogTitle>
              <DialogDescription>Copy this password now and share it securely. It won't be shown again.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">New password</label>
              <div className="flex gap-2">
                <Input readOnly value={password} className="flex-1 font-mono" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(password);
                    toast.success("Password copied.");
                  }}
                >
                  <Copy />
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Reset password</DialogTitle>
              <DialogDescription>
                Set a new password for <span className="font-mono">{userEmail}</span>. This immediately replaces their current password.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reset-password" className="text-xs font-medium">
                New password
              </label>
              <div className="flex gap-2">
                <Input id="reset-password" className="flex-1 font-mono" value={password} onChange={(e) => setPassword(e.target.value)} />
                <Button type="button" variant="outline" size="sm" onClick={() => setPassword(generatePassword())}>
                  <ArrowClockwise /> Generate
                </Button>
              </div>
            </div>
            {setPasswordMutation.error && <p className="text-xs text-destructive">{setPasswordMutation.error.message}</p>}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button disabled={password.length < 8 || setPasswordMutation.isPending} onClick={() => setPasswordMutation.mutate()}>
                {setPasswordMutation.isPending ? "Updating…" : "Set password"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
