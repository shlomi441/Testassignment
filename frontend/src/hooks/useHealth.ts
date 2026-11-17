import { useQuery } from "@tanstack/react-query";
import { getHealth } from "../api.ts";

export type HealthState = "checking" | "up" | "down";

export function useHealth(): HealthState {
  const { data } = useQuery({
    queryKey: ["health"],
    queryFn: () =>
      getHealth()
        .then((health) => (health.status === "ok" ? "up" : "down"))
        .catch(() => "down" as const),
    refetchInterval: 10_000,
  });
  return data ?? "checking";
}
