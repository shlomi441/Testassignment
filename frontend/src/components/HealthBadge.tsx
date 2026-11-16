import type { HealthState } from "../hooks/useHealth.ts";
import styles from "./HealthBadge.module.css";

export function HealthBadge({ state }: { state: HealthState }) {
  return (
    <output className={`${styles.badge} ${styles[state]}`}>API: {state}</output>
  );
}
