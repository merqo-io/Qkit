// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoothDangerZone } from "./booth-danger-zone";

function setup(
  onDelete: () => Promise<void> | void,
  boothName = "Pad Thai Cart",
) {
  const user = userEvent.setup();
  render(
    <BoothDangerZone
      boothName={boothName}
      deleting={false}
      saving={false}
      onDelete={onDelete}
    />,
  );
  return user;
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.pointer({
    keys: "[TouchA]",
    target: screen.getByRole("button", { name: "Delete booth" }),
  });
  return screen.findByRole("alertdialog");
}

function confirmButton(dialog: HTMLElement) {
  return screen
    .getAllByRole("button", { name: "Delete booth" })
    .find((b) => dialog.contains(b))!;
}

describe("BoothDangerZone", () => {
  it("keeps Delete disabled until the booth name is typed", async () => {
    const onDelete = vi.fn();
    const user = setup(onDelete);
    const dialog = await openDialog(user);
    expect(dialog.textContent).toMatch(
      /every order placed at this booth is deleted/i,
    );
    const confirm = confirmButton(dialog);
    expect(confirm).toBeDisabled();
    await user.type(screen.getByRole("textbox"), "Pad Thai Cart");
    expect(confirm).toBeEnabled();
    await user.pointer({ keys: "[TouchA]", target: confirm });
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });

  it("still gates the delete when the booth name is blank", async () => {
    const onDelete = vi.fn();
    const user = setup(onDelete, "  ");
    const dialog = await openDialog(user);
    const confirm = confirmButton(dialog);
    expect(confirm).toBeDisabled();
    await user.type(screen.getByRole("textbox"), "delete");
    expect(confirm).toBeEnabled();
  });

  it("stays open and shows the error when the delete fails", async () => {
    const user = setup(() => Promise.reject(new Error("Booth is in use")));
    const dialog = await openDialog(user);
    await user.type(screen.getByRole("textbox"), "pad thai cart");
    await user.pointer({ keys: "[TouchA]", target: confirmButton(dialog) });
    expect(await screen.findByText(/Booth is in use/)).toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
