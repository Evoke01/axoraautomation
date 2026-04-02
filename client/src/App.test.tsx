import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";
import App from "./App";

test("renders pricing navigation hook", () => {
  render(
    <MemoryRouter initialEntries={["/pricing"]}>
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByText(/pricing hooks/i)).toBeInTheDocument();
  expect(screen.getByText("$29/mo")).toBeInTheDocument();
  expect(screen.getByText(/talk to sales/i)).toBeInTheDocument();
});
