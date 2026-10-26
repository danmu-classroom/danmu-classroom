#!/usr/bin/env bash
# Copies the LINE channel secret and access token of the original Rails app (stored in its
# encrypted credentials, unlocked by RAILS_MASTER_KEY on Heroku) into this Worker's secrets.
# Values are piped from one command to the next and never printed.
#
# Needs: heroku and wrangler CLIs logged in on this machine, the danmu-classroom-server dev
# container running (it decrypts the credentials), and the Worker deployed once.
set -euo pipefail

HEROKU_APP=${HEROKU_APP:-danmu-classroom}
SERVER_CONTAINER=${SERVER_CONTAINER:-danmu-classroom-server-app-1}
WORKER_DIR="$(cd "$(dirname "$0")/../apps/worker" && pwd)"
command -v wrangler > /dev/null || { echo "wrangler not found (nvm use 24?)" >&2; exit 1; }

master_key=$(heroku config:get RAILS_MASTER_KEY -a "$HEROKU_APP")
[ -n "$master_key" ] || { echo "RAILS_MASTER_KEY not found on Heroku app $HEROKU_APP" >&2; exit 1; }

# Prints one value of line_bot in the Rails credentials. The master key goes in on stdin,
# not on the command line, so it does not show up in the process list.
read_line_credential() {
  printf '%s' "$master_key" | docker exec -i -w /workspaces/danmu-classroom-server "$SERVER_CONTAINER" \
    bash -c 'RAILS_MASTER_KEY=$(cat) exec bin/rails runner "print Rails.application.credentials.dig(:line_bot, :$0).to_s"' "$1"
}

put_worker_secret() {
  (cd "$WORKER_DIR" && wrangler secret put "$1" > /dev/null)
}

for pair in channel_secret:LINE_CHANNEL_SECRET channel_token:LINE_CHANNEL_TOKEN; do
  credential=${pair%%:*}
  secret=${pair##*:}
  value=$(read_line_credential "$credential")
  [ -n "$value" ] || { echo "line_bot.$credential is missing in the Rails credentials" >&2; exit 1; }
  printf '%s' "$value" | put_worker_secret "$secret"
  echo "✓ $secret set (from line_bot.$credential)"
done
