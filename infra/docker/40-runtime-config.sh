#!/bin/sh
set -eu
# jq safely escapes runtime values. Browser configuration contains no secrets.
jq -n --arg api "${PUBLIC_API_URL:-}" --arg authority "${PUBLIC_OIDC_AUTHORITY:-}" \
  --arg client "${PUBLIC_OIDC_CLIENT_ID:-}" --arg scope "${PUBLIC_OIDC_SCOPE:-openid profile email}" \
  '{API_URL:$api,OIDC_AUTHORITY:$authority,OIDC_CLIENT_ID:$client,OIDC_SCOPE:$scope}' \
  | sed '1s/^/window.MAYRAVIQ_CONFIG = /; $s/$/;/' > /usr/share/nginx/html/runtime-config.js
