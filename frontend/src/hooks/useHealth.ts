import { useQuery } from "@tanstack/react-query";
import { getHealth } from "../api.ts";

export type HealthState = "checking" | "up" | "down";

export function useHealth(): HealthState {
  const { status, data } = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 10_000,
  });
  if (status === "pending") return "checking";
  return status === "success" && data.status === "ok" ? "up" : "down";
}
