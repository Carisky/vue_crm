#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$root_dir/.env"

if [[ ! -f "$env_file" ]]; then
  echo ".env not found at $env_file"
  exit 1
fi

site_url="$(
  grep -E '^PUBLIC_SITE_URL=' "$env_file" \
    | tail -n 1 \
    | cut -d '=' -f 2- \
    | tr -d '"'\'''
)"

domain="${site_url#http://}"
domain="${domain#https://}"
domain="${domain%%/*}"

if [[ -z "$domain" ]]; then
  echo "PUBLIC_SITE_URL is empty or invalid"
  exit 1
fi

if ! command -v certbot >/dev/null 2>&1; then
  echo "certbot is not installed. Install certbot and python3-certbot-nginx first."
  exit 1
fi

sudo certbot --nginx -d "$domain" --redirect
