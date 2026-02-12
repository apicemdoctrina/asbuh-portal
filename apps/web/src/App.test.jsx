import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import App from "./App.jsx";

// Mock fetch globally for auth context restore attempt
globalThis.fetch = vi.fn(() =>
  Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) }),
);

describe("App", () => {
  it("renders login page by default (unauthenticated)", async () => {
    render(<App />);
    // Should redirect to login or show login form
    const loginButton = await screen.findByText("Войти");
    expect(loginButton).toBeInTheDocument();
  });
});
