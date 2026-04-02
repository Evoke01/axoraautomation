import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";
import App from "./App";

test("renders the get started onboarding flow", () => {
  render(
    <MemoryRouter initialEntries={["/start"]}>
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByRole("heading", { name: /create a business, generate the slug/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/business name/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /create business/i })).toBeInTheDocument();
});
