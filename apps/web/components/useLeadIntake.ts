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
  remove?: (widgetId: string) => void;
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
  product?: string;
  product_id?: string;
  product_type?: "device" | "accessory";
  device?: string;
  device_id?: string;
  quote_id?: string;
  target_product_id?: string;
  target_offer_id?: string;
  store_location_id?: string;
  preferred_visit_date?: string;
  preferred_visit_period?: "morning" | "day" | "evening";
  contact_channel?: "phone" | "telegram";
  idempotency_key?: string;
  club_offer?: string;
  club_plan?: string;
  club_term_months?: number | string;
  club_budget_text?: string;
  club_device_request?: string;
  club_consent_accepted?: boolean;
  club_consent_version?: string;
  trade_consent_accepted?: boolean;
  trade_consent_version?: string;
  message?: string;
  source?: string;
  website?: string;
};

export type LeadSubmitResult = {
  telegram_url?: string;
  ok: true;
  storage: "directus";
  reference_code?: string;
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
  const [turnstileElement, setTurnstileElement] = useState<HTMLDivElement | null>(null);
  const turnstileElementRef = useCallback(
    (element: HTMLDivElement | null) => setTurnstileElement(element),
    [],
  );
  const turnstileWidgetRef = useRef<string>();
  const submission = useRef<true | string>();
  const turnstileRequired = Boolean(TURNSTILE_SITE_KEY);

  const resetTurnstile = useCallback(() => {
    setTurnstileToken("");
    if (turnstileWidgetRef.current) window.turnstile?.reset(turnstileWidgetRef.current);
  }, []);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !turnstileElement) return;

    let attempts = 0;
    let cancelled = false;
    let timeoutId: number | undefined;

    function renderWidget() {
      if (cancelled || turnstileWidgetRef.current) return;
      if (window.turnstile) {
        turnstileWidgetRef.current = window.turnstile.render(turnstileElement!, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token) => {
            if (!cancelled) setTurnstileToken(token);
          },
          "expired-callback": () => {
            if (!cancelled) setTurnstileToken("");
          },
          "error-callback": () => {
            if (!cancelled) setTurnstileToken("");
          },
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
      if (turnstileWidgetRef.current) window.turnstile?.remove?.(turnstileWidgetRef.current);
      turnstileWidgetRef.current = undefined;
      setTurnstileToken("");
    };
  }, [turnstileElement]);

  const submitLead = useCallback(
    async (
      payload: LeadPayload,
      onFailure?: (code: string) => void,
    ): Promise<LeadSubmitResult | null> => {
      if (submission.current === true) return null;
      if (!payload.contact.trim() || (TURNSTILE_SITE_KEY && !turnstileToken)) {
        setState("error");
        return null;
      }

      submission.current = true;
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
        const failure = await response?.json().catch(() => null);
        onFailure?.(typeof failure?.error === "string" ? failure.error : "network_error");
        submission.current = undefined;
        resetTurnstile();
        setState("error");
        return null;
      }

      const result = (await response.json().catch(() => null)) as LeadSubmitResult | null;
      resetTurnstile();
      if (!result?.ok) {
        submission.current = undefined;
        setState("error");
        return null;
      }
      submission.current = result.telegram_url;
      setState("success");
      return result;
    },
    [resetTurnstile, turnstileToken],
  );

  return {
    markError: () => setState("error"),
    resetState: () => {
      setState("idle");
      submission.current = undefined;
    },
    telegramUrl:
      state === "success" && typeof submission.current === "string"
        ? submission.current
        : undefined,
    resetTurnstile,
    state,
    submitLead,
    turnstileElementRef,
    turnstileReady: !turnstileRequired || Boolean(turnstileToken),
    turnstileRequired,
    turnstileToken,
  };
}
