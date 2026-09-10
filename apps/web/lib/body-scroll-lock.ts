import type { KeyboardEvent } from "react";

let locks = 0;
let wasLocked = false;

export function lockBodyScroll() {
  if (locks++ === 0) {
    wasLocked = document.body.classList.contains("overflow-hidden");
    document.body.classList.add("overflow-hidden");
  }
  return () => {
    if (--locks === 0 && !wasLocked) document.body.classList.remove("overflow-hidden");
  };
}

export function keepDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const nodes = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    ),
  ).filter((node) => node.getClientRects().length > 0);
  const first = nodes[0];
  const last = nodes.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
