import * as React from "react";
import { api } from "@/lib/api";
import { toastError } from "@/lib/toast";

export type KuberfyUpdateState = "checking" | "up-to-date" | "available" | "unknown";

// Shared by UpdateCard (Settings) and the sidebar footer button so both reflect the same check/update/restart cycle.
export function useKuberfyUpdate() {
  const [state, setState] = React.useState<KuberfyUpdateState>("checking");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [updating, setUpdating] = React.useState(false);
  const [restarting, setRestarting] = React.useState(false);

  const check = React.useCallback(async () => {
    setState("checking");
    try {
      const result = await api.checkKuberfyUpdate();
      setState(result.updateAvailable === null ? "unknown" : result.updateAvailable ? "available" : "up-to-date");
    } catch (err) {
      toastError(err, "Failed to check for updates.");
      setState("unknown");
    }
  }, []);

  React.useEffect(() => {
    check();
  }, [check]);

  function pollUntilBack() {
    api
      .getSettings()
      .then(() => window.location.reload())
      .catch(() => setTimeout(pollUntilBack, 2000));
  }

  async function update() {
    setUpdating(true);
    try {
      await api.updateKuberfy();
      setConfirmOpen(false);
      setRestarting(true);
      setTimeout(pollUntilBack, 3000);
    } catch (err) {
      toastError(err, "Failed to start the update.");
      setUpdating(false);
    }
  }

  return { state, check, confirmOpen, setConfirmOpen, updating, restarting, update };
}
