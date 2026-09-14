import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { consumeBackPress, pushBackHandler } from "../lib/backStack";
import { refreshWorkspace, registerWorkspaceRefresh } from "../lib/workspaceRefresh";
import { parseDeepLink } from "../lib/deepLinks";
import { AndroidSheet } from "../components/native/AndroidSheet";

vi.mock("../components/native/androidHaptics", () => ({
  hapticTap: () => undefined,
}));

describe("backStack", () => {
  it("closes the most recently opened surface first", () => {
    const closed: string[] = [];
    const unregisterOuter = pushBackHandler(() => closed.push("outer"));
    pushBackHandler(() => closed.push("inner"));

    expect(consumeBackPress()).toBe(true);
    expect(closed).toEqual(["inner"]);
    unregisterOuter();
    // Nothing left: the back press falls through to navigation.
    expect(consumeBackPress()).toBe(false);
  });
});

describe("workspaceRefresh", () => {
  it("reports false when nothing is registered", async () => {
    expect(await refreshWorkspace()).toBe(false);
  });

  it("shares one request between concurrent pulls", async () => {
    let calls = 0;
    let finish!: () => void;
    const unregister = registerWorkspaceRefresh(() => {
      calls++;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    const first = refreshWorkspace();
    const second = refreshWorkspace();
    finish();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(calls).toBe(1);
    unregister();
  });

  it("resolves false instead of throwing when the reload fails", async () => {
    const unregister = registerWorkspaceRefresh(async () => {
      throw new Error("offline");
    });
    expect(await refreshWorkspace()).toBe(false);
    unregister();
  });

  it("does not let a stale unregister remove a newer handler", async () => {
    const unregisterOld = registerWorkspaceRefresh(async () => undefined);
    const unregisterNew = registerWorkspaceRefresh(async () => undefined);
    unregisterOld();
    expect(await refreshWorkspace()).toBe(true);
    unregisterNew();
  });
});

describe("deck shortcut deep links", () => {
  it("routes a pinned-deck shortcut to that deck's study session", () => {
    expect(parseDeepLink("auramind://app/dashboard/study/deck-42")).toBe("/dashboard/study/deck-42");
  });
});

describe("auraDevice off-device", () => {
  it("is a silent no-op outside the Android app", async () => {
    const device = await import("../lib/auraDevice");
    await expect(device.setKeepAwake(true)).resolves.toBeUndefined();
    await expect(device.publishRecentDecks([{ id: "d", title: "Deck" }])).resolves.toBeUndefined();
    expect(await device.canPinDecks()).toBe(false);
    expect(await device.pinDeckToHomeScreen({ id: "d", title: "Deck" })).toBe(false);
  });
});

describe("AndroidSheet", () => {
  beforeEach(() => {
    while (consumeBackPress()) {
      // drain handlers left by other tests
    }
  });
  afterEach(cleanup);

  it("closes on the system back gesture instead of navigating", async () => {
    const onClose = vi.fn();
    render(
      <AndroidSheet open onClose={onClose} title="Deck">
        <button type="button">Study</button>
      </AndroidSheet>,
    );
    expect(await screen.findByRole("dialog", { name: "Deck" })).toBeInTheDocument();
    expect(consumeBackPress()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("cannot be dismissed while busy", async () => {
    const onClose = vi.fn();
    render(
      <AndroidSheet open busy onClose={onClose} title="Deleting">
        <p>Working</p>
      </AndroidSheet>,
    );
    await screen.findByRole("dialog", { name: "Deleting" });
    fireEvent.keyDown(window, { key: "Escape" });
    consumeBackPress();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("unregisters its back handler when it closes", async () => {
    const { rerender } = render(
      <AndroidSheet open onClose={() => undefined} title="Deck">
        <p>Body</p>
      </AndroidSheet>,
    );
    await screen.findByRole("dialog", { name: "Deck" });
    rerender(
      <AndroidSheet open={false} onClose={() => undefined} title="Deck">
        <p>Body</p>
      </AndroidSheet>,
    );
    await waitFor(() => expect(consumeBackPress()).toBe(false));
  });
});
