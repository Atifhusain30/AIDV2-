#!/usr/bin/env bash
# AID — save your Stripe keys locally without showing them on screen (C1).
#
# Run it in your own Terminal from anywhere:
#   bash "/path/to/AIDV2-/scripts/set-stripe-keys.sh"
#
# What it does:
#   1. Asks for the Stripe secret key (sk_test_… / sk_live_…), the publishable key (pk_test_… / pk_live_…)
#      and, optionally, the webhook signing secret (whsec_…). Typing is hidden.
#   2. Checks the prefixes, and that both keys are the same mode (test with test, live with live).
#   3. Writes them into server/.env (STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET) and
#      the publishable key into .env.local (VITE_STRIPE_PUBLISHABLE_KEY, what the app reads). Every other
#      line in those files is kept as it is. Both files are set to owner-only (chmod 600) and stay out of Git.
#   4. Asks Stripe whether the secret key works and prints only "Stripe key OK (test mode)" or the error type.
#
# Nothing is printed, logged or passed on a command line where other programs could see it.
# For testing the script itself: AID_SERVER_ENV / AID_CLIENT_ENV point at other files.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVER_ENV="${AID_SERVER_ENV:-${REPO_ROOT}/server/.env}"
CLIENT_ENV="${AID_CLIENT_ENV:-${REPO_ROOT}/.env.local}"
STRIPE_API="${AID_STRIPE_API:-https://api.stripe.com}"

say() { printf '%s\n' "$*"; }
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

# Hidden prompt. Reads from the keyboard; surrounding spaces and a pasted line break are removed.
ask_hidden() {
  local prompt="$1" answer=""
  if [ -t 0 ]; then
    IFS= read -r -s -p "${prompt}" answer || true
    printf '\n' >&2
  else
    IFS= read -r answer || true
  fi
  answer="$(printf '%s' "${answer}" | tr -d '\r\n' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  printf '%s' "${answer}"
}

# Set NAME=value in an env file, replacing an existing NAME= line (or adding one), keeping every other
# line. The value travels to awk through the environment, never through the command line.
set_env_var() {
  local file="$1" name="$2" value="$3" dir tmp
  dir="$(dirname "${file}")"
  [ -d "${dir}" ] || fail "Folder not found: ${dir}"
  [ -f "${file}" ] || { : > "${file}"; chmod 600 "${file}"; }
  tmp="$(mktemp "${dir}/.env-update.XXXXXX")"
  chmod 600 "${tmp}"
  if ! AID_NAME="${name}" AID_VALUE="${value}" awk '
    BEGIN { name = ENVIRON["AID_NAME"]; value = ENVIRON["AID_VALUE"]; done = 0 }
    $0 ~ ("^[[:space:]]*(export[[:space:]]+)?" name "[[:space:]]*=") {
      if (!done) { print name "=" value; done = 1 }
      next
    }
    { print }
    END { if (!done) print name "=" value }
  ' "${file}" > "${tmp}"; then
    rm -f "${tmp}"
    fail "Could not update ${file}"
  fi
  mv "${tmp}" "${file}"
  chmod 600 "${file}"
}

# The env files must never be committed.
check_ignored() {
  local file="$1"
  if command -v git >/dev/null 2>&1 && git -C "${REPO_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    case "${file}" in
      "${REPO_ROOT}"/*)
        git -C "${REPO_ROOT}" check-ignore -q "${file}" || fail "${file} is not ignored by Git — stopping so the keys can't be committed."
        ;;
    esac
  fi
}

mode_of() {
  case "$1" in
    sk_test_*|pk_test_*) printf 'test' ;;
    sk_live_*|pk_live_*) printf 'live' ;;
    *) printf 'unknown' ;;
  esac
}

say "AID — Stripe key setup"
say "Keys are hidden while you type or paste. Find them at https://dashboard.stripe.com/apikeys"
say ""

check_ignored "${SERVER_ENV}"
check_ignored "${CLIENT_ENV}"

SECRET_KEY="$(ask_hidden 'Stripe secret key (sk_test_… or sk_live_…): ')"
case "${SECRET_KEY}" in
  sk_test_?*|sk_live_?*) ;;
  "") fail "No secret key entered. Nothing was changed." ;;
  pk_*) fail "That looks like a publishable key (pk_…). The secret key starts with sk_test_ or sk_live_. Nothing was changed." ;;
  rk_*) fail "That is a restricted key (rk_…). Use the standard secret key (sk_test_ or sk_live_). Nothing was changed." ;;
  *) fail "The secret key must start with sk_test_ or sk_live_. Nothing was changed." ;;
esac
case "${SECRET_KEY}" in *[[:space:]]*) fail "The secret key contains a space. Copy it again. Nothing was changed." ;; esac

PUBLISHABLE_KEY="$(ask_hidden 'Stripe publishable key (pk_test_… or pk_live_…): ')"
case "${PUBLISHABLE_KEY}" in
  pk_test_?*|pk_live_?*) ;;
  "") fail "No publishable key entered. Nothing was changed." ;;
  sk_*) fail "That looks like a secret key (sk_…). The publishable key starts with pk_test_ or pk_live_. Nothing was changed." ;;
  *) fail "The publishable key must start with pk_test_ or pk_live_. Nothing was changed." ;;
esac
case "${PUBLISHABLE_KEY}" in *[[:space:]]*) fail "The publishable key contains a space. Copy it again. Nothing was changed." ;; esac

MODE="$(mode_of "${SECRET_KEY}")"
if [ "${MODE}" != "$(mode_of "${PUBLISHABLE_KEY}")" ]; then
  fail "The keys are from different modes (one test, one live). Copy both from the same Stripe mode. Nothing was changed."
fi

WEBHOOK_SECRET="$(ask_hidden 'Webhook signing secret (whsec_…) — press Return to skip and keep the current one: ')"
if [ -n "${WEBHOOK_SECRET}" ]; then
  case "${WEBHOOK_SECRET}" in
    whsec_?*) ;;
    *) fail "The webhook signing secret must start with whsec_. Nothing was changed." ;;
  esac
  case "${WEBHOOK_SECRET}" in *[[:space:]]*) fail "The webhook secret contains a space. Copy it again. Nothing was changed." ;; esac
fi

if [ "${MODE}" = "live" ]; then
  say ""
  say "WARNING: these are LIVE keys. Real cards will be charged real money."
  say "Use test keys (sk_test_ / pk_test_) until AID is ready to launch."
  if [ -t 0 ]; then
    CONFIRM=""
    IFS= read -r -p "Type LIVE to save live keys, or anything else to stop: " CONFIRM || true
    [ "${CONFIRM}" = "LIVE" ] || fail "Stopped. Nothing was changed."
  else
    [ "${AID_ALLOW_LIVE:-}" = "1" ] || fail "Live keys need confirmation in an interactive Terminal. Nothing was changed."
  fi
fi

set_env_var "${SERVER_ENV}" STRIPE_SECRET_KEY "${SECRET_KEY}"
set_env_var "${SERVER_ENV}" STRIPE_PUBLISHABLE_KEY "${PUBLISHABLE_KEY}"
if [ -n "${WEBHOOK_SECRET}" ]; then set_env_var "${SERVER_ENV}" STRIPE_WEBHOOK_SECRET "${WEBHOOK_SECRET}"; fi
set_env_var "${CLIENT_ENV}" VITE_STRIPE_PUBLISHABLE_KEY "${PUBLISHABLE_KEY}"

say ""
say "Saved (values not shown):"
say "  server/.env  → STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY$([ -n "${WEBHOOK_SECRET}" ] && printf ', STRIPE_WEBHOOK_SECRET')"
say "  .env.local   → VITE_STRIPE_PUBLISHABLE_KEY"
say ""

# Ask Stripe whether the secret key works. The key goes to curl on stdin (--config -), not the command line.
if ! command -v curl >/dev/null 2>&1; then
  say "curl is not installed, so the key could not be checked with Stripe."
  exit 0
fi
BODY="$(mktemp "${TMPDIR:-/tmp}/aid-stripe-check.XXXXXX")"
trap 'rm -f "${BODY}"' EXIT
STATUS="$(printf 'user = "%s:"\n' "${SECRET_KEY}" | curl -sS --max-time 20 --config - -o "${BODY}" -w '%{http_code}' "${STRIPE_API}/v1/balance" 2>/dev/null || true)"
unset SECRET_KEY PUBLISHABLE_KEY WEBHOOK_SECRET

if [ "${STATUS}" = "200" ]; then
  say "Stripe key OK (${MODE} mode)"
  say "Restart the AID server so it picks up the new keys, and rebuild the app (npm run build) for the publishable key."
  exit 0
fi

ERROR_TYPE="$(sed -n 's/.*"type"[[:space:]]*:[[:space:]]*"\([a-z_]*\)".*/\1/p' "${BODY}" | head -n 1)"
if [ -z "${STATUS}" ] || [ "${STATUS}" = "000" ]; then
  say "Stripe key check failed: could not reach Stripe (no internet?). The keys were saved; run this again later to check."
else
  say "Stripe key check failed: ${ERROR_TYPE:-unknown_error} (HTTP ${STATUS}). The keys were saved — check you copied the right secret key and run this again."
fi
exit 2
