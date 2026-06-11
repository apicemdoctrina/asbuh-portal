import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Modal from "./Modal.jsx";

describe("Modal", () => {
  it("renders title, children and footer", () => {
    render(
      <Modal onClose={() => {}} title="Заголовок" footer={<button>Сохранить</button>}>
        <p>Контент</p>
      </Modal>,
    );
    expect(screen.getByText("Заголовок")).toBeInTheDocument();
    expect(screen.getByText("Контент")).toBeInTheDocument();
    expect(screen.getByText("Сохранить")).toBeInTheDocument();
  });

  it("renders nothing when open=false", () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}} title="Скрыт">
        x
      </Modal>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("calls onClose on X button click", () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} title="T">
        x
      </Modal>,
    );
    fireEvent.click(screen.getByLabelText("Закрыть"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} title="T">
        x
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on overlay click but not on panel click", () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} title="T">
        <p>Внутри</p>
      </Modal>,
    );
    fireEvent.mouseDown(screen.getByText("Внутри"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on overlay click when closeOnOverlay=false", () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} title="T" closeOnOverlay={false}>
        x
      </Modal>,
    );
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
