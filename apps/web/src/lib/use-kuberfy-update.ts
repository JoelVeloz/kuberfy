import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { toastError } from "@/lib/toast";

const UPDATE_CHECK_TTL_MS = 10 * 60_000;

export type KuberfyUpdateState = "checking" | "up-to-date" | "available" | "unknown";

export function useKuberfyUpdate() {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [updating, setUpdating] = React.useState(false);
  const [restarting, setRestarting] = React.useState(false);

  const query = useQuery({ queryKey: ["kuberfy-update"], queryFn: api.checkKuberfyUpdate, staleTime: UPDATE_CHECK_TTL_MS, retry: false }, queryClient);

  React.useEffect(() => {
    if (query.error) toastError(query.error, "Failed to check for updates.");
  }, [query.error]);

  const state: KuberfyUpdateState =
    query.isFetching || (!query.data && !query.error)
      ? "checking"
      : !query.data || query.data.updateAvailable === null
        ? "unknown"
        : query.data.updateAvailable
          ? "available"
          : "up-to-date";

  const check = React.useCallback(() => {
    query.refetch();
  }, [query.refetch]);

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
