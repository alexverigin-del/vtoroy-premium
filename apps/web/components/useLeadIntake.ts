"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type LeadSubmitState = "idle" | "submitting" | "success" | "error";

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type LeadPayload = {
  kind?: string;
  scenario?: string;
  name?: string;
  contact: string;
  device?: string;
  device_id?: string;
  message?: string;
  source?: string;
  website?: string;
};

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

function trackingPayload() {
  const params = new URLSearchParams(window.location.search);
  return {
    source_path: window.location.pathname,
    source_url: window.location.href,
    page_title: document.title,
    referrer: document.referrer,
    utm_source: params.get("utm_source") ?? "",
    utm_medium: params.get("utm_medium") ?? "",
    utm_campaign: params.get("utm_campaign") ?? "",
    utm_content: params.get("utm_content") ?? "",
    utm_term: params.get("utm_term") ?? "",
  };
}

export function useLeadIntake() {
  const [state, setState] = useState<LeadSubmitState>("idle");
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileElementRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetRef = useRef<string>();
  const turnstileRequired = Boolean(TURNSTILE_SITE_KEY);

  const resetTurnstile = useCallback(() => {
    setTurnstileToken("");
    if (turnstileWidgetRef.current) window.turnstile?.reset(turnstileWidgetRef.current);
  }, []);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !turnstileElementRef.current || turnstileWidgetRef.current) return;

    let attempts = 0;
    let cancelled = false;
    let timeoutId: number | undefined;

    function renderWidget() {
      if (cancelled || !turnstileElementRef.current || turnstileWidgetRef.current) return;
      if (window.turnstile) {
        turnstileWidgetRef.current = window.turnstile.render(turnstileElementRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: setTurnstileToken,
          "expired-callback": () => setTurnstileToken(""),
          "error-callback": () => setTurnstileToken(""),
        });
        return;
      }
      attempts += 1;
      if (attempts < 40) {
        timeoutId = window.setTimeout(renderWidget, 250);
      }
    }

    renderWidget();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  const submitLead = useCallback(
    async (payload: LeadPayload): Promise<boolean> => {
      if (!payload.contact.trim() || (TURNSTILE_SITE_KEY && !turnstileToken)) {
        setState("error");
        return false;
      }

      setState("submitting");
      const response = await fetch("/lead-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          turnstile_token: turnstileToken,
          ...trackingPayload(),
        }),
      }).catch(() => null);

      if (!response?.ok) {
        resetTurnstile();
        setState("error");
        return false;
      }

      resetTurnstile();
      setState("success");
      return true;
    },
    [resetTurnstile, turnstileToken],
  );

  return {
    markError: () => setState("error"),
    resetState: () => setState("idle"),
    resetTurnstile,
    state,
    submitLead,
    turnstileElementRef,
    turnstileReady: !turnstileRequired || Boolean(turnstileToken),
    turnstileRequired,
    turnstileToken,
  };
}
