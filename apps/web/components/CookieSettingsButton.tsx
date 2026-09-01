"use client";

import { useEffect, useState } from "react";

import {
  INTEGRATION_SETTINGS_AVAILABILITY_EVENT,
  OPEN_INTEGRATION_SETTINGS_EVENT,
} from "@/lib/site-integrations";

type AvailabilityDetail = { available?: boolean; label?: string };

export function CookieSettingsButton() {
  const [available, setAvailable] = useState(false);
  const [label, setLabel] = useState("");

  useEffect(() => {
    setAvailable(document.documentElement.dataset.integrationSettingsAvailable === "true");
    const currentLabel = document.documentElement.dataset.integrationSettingsLabel;
    if (currentLabel) setLabel(currentLabel);

    const onAvailability = (event: Event) => {
      const detail = (event as CustomEvent<AvailabilityDetail>).detail;
      setAvailable(detail?.available === true);
      if (detail?.label) setLabel(detail.label);
    };
    window.addEventListener(INTEGRATION_SETTINGS_AVAILABILITY_EVENT, onAvailability);
    return () =>
      window.removeEventListener(INTEGRATION_SETTINGS_AVAILABILITY_EVENT, onAvailability);
  }, []);

  if (!available) return null;
  return (
    <button
      type="button"
      className="min-h-11 underline-offset-4 outline-none hover:underline focus-visible:shadow-focus"
      onClick={() => window.dispatchEvent(new Event(OPEN_INTEGRATION_SETTINGS_EVENT))}
    >
      {label}
    </button>
  );
}
