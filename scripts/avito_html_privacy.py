"""Return safe HTML identifier evidence, distinguishing published legal IDs from IMEI."""

import re


def check_html_identifiers(body, private_identifiers, public_legal_identifiers=()):
    normalize = lambda value: re.sub(r"[^A-Z0-9]", "", value.upper())
    normalized = normalize(body)
    private_match = any(normalize(value) in normalized for value in private_identifiers
                        if len(normalize(value)) >= 8)
    legal = {str(value).strip() for value in public_legal_identifiers
             if re.fullmatch(r"\d{10}|\d{12}|\d{13}|\d{15}", str(value).strip())}
    unknown_numeric = set(re.findall(r"(?<!\d)\d{15}(?!\d)", body)) - legal
    return {"ok": not private_match and not unknown_numeric,
            "known_private_identifier_detected": private_match,
            "unclassified_15_digit_runs": len(unknown_numeric)}
