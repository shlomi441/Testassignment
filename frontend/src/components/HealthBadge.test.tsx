import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { HealthBadge } from "./HealthBadge.tsx";

test("says in words that the API is up, down or being checked", () => {
  const { rerender } = render(<HealthBadge state="up" />);
  expect(screen.getByRole("status").textContent).toBe("API: up");

  rerender(<HealthBadge state="down" />);
  expect(screen.getByRole("status").textContent).toBe("API: down");

  rerender(<HealthBadge state="checking" />);
  expect(screen.getByRole("status").textContent).toBe("API: checking");
});
