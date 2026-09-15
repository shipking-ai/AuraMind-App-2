import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  ANALYTICS_PREF_KEY,
  CONSENT_CHOICE_KEY,
  getConsentChoice,
  hasConsentChoice,
  recordConsentChoice,
} from "../lib/consent";
import { getAppPreference } from "../lib/appPreferences";
import { CookieConsentBanner } from "../components/shared/CookieConsentBanner";
import { analyticsService } from "../services/analytics/analyticsService";

vi.mock("../services/analytics/analyticsService", () => ({
  analyticsService: { init: vi.fn() },
}));

const initMock = vi.mocked(analyticsService.init);

describe("lib/consent", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts with no choice stored", () => {
    expect(hasConsentChoice()).toBe(false);
    expect(getConsentChoice()).toBeNull();
  });

  it("recordConsentChoice persists both the marker and the analytics switch", () => {
    recordConsentChoice(true);
    expect(getConsentChoice()).toBe("accepted");
    expect(getAppPreference(ANALYTICS_PREF_KEY, false)).toBe(true);
    expect(hasConsentChoice()).toBe(true);
  });
});

describe("CookieConsentBanner", () => {
  beforeEach(() => {
    window.localStorage.clear();
    initMock.mockClear();
  });

  it("renders when the visitor has never been asked", () => {
    render(<CookieConsentBanner />);
    expect(screen.getByRole("region", { name: "Cookie consent" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Accept" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Decline" })).not.toBeNull();
  });

  it("accept enables analytics, records the choice, hides, and starts init", () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(getAppPreference(ANALYTICS_PREF_KEY, false)).toBe(true);
    expect(window.localStorage.getItem(CONSENT_CHOICE_KEY)).toBe('"accepted"');
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: "Cookie consent" })).toBeNull();
  });

  it("decline disables analytics and never starts init", () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(getAppPreference(ANALYTICS_PREF_KEY, true)).toBe(false);
    expect(window.localStorage.getItem(CONSENT_CHOICE_KEY)).toBe('"declined"');
    expect(initMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Cookie consent" })).toBeNull();
  });

  it("stays hidden when a choice is already stored", () => {
    recordConsentChoice(true);
    const { container } = render(<CookieConsentBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("honors a legacy Settings opt-out silently and backfills the marker", () => {
    window.localStorage.setItem(ANALYTICS_PREF_KEY, "false");
    const { container } = render(<CookieConsentBanner />);
    expect(container).toBeEmptyDOMElement();
    expect(getConsentChoice()).toBe("declined");
    expect(initMock).not.toHaveBeenCalled();
  });
});
