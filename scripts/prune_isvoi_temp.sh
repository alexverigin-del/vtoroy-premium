#!/usr/bin/env bash
set -euo pipefail

apply=0
if [[ "${1:-}" == "--apply" ]]; then
  apply=1
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--apply]" >&2
  exit 2
fi

root="${ISVOI_TEMP_ROOT:-/tmp}"
max_age_minutes="${ISVOI_TEMP_MAX_AGE_MINUTES:-10080}"

[[ "$root" == /* ]] || { echo "ISVOI_TEMP_ROOT must be absolute" >&2; exit 2; }
[[ "$max_age_minutes" =~ ^[0-9]+$ ]] || { echo "ISVOI_TEMP_MAX_AGE_MINUTES must be numeric" >&2; exit 2; }
[[ -d "$root" ]] || { echo "Temporary root does not exist: $root" >&2; exit 2; }

root="$(realpath -e -- "$root")"
mapfile -d '' candidates < <(
  find "$root" -mindepth 1 -maxdepth 1 -name 'isvoi-*' -mmin "+$max_age_minutes" -print0
)

bytes=0
for target in "${candidates[@]}"; do
  [[ "$(dirname -- "$target")" == "$root" ]] || { echo "Refusing path outside $root: $target" >&2; exit 2; }
  [[ "$(basename -- "$target")" == isvoi-* ]] || { echo "Refusing unexpected name: $target" >&2; exit 2; }
  if [[ -d "$target" && ! -L "$target" ]]; then
    mountpoint -q -- "$target" && { echo "Refusing mount point: $target" >&2; exit 2; }
    size="$(du -sb -- "$target" | cut -f1)"
  else
    size="$(stat -c %s -- "$target")"
  fi
  bytes=$((bytes + size))
done

if ((apply)); then
  for target in "${candidates[@]}"; do
    if [[ -d "$target" && ! -L "$target" ]]; then
      rm -rf -- "$target"
    else
      rm -f -- "$target"
    fi
  done
fi

printf 'ISVOI_TEMP_RETENTION mode=%s remove=%s bytes=%s root=%s\n' \
  "$([[ "$apply" == 1 ]] && echo apply || echo dry-run)" \
  "${#candidates[@]}" \
  "$bytes" \
  "$root"
