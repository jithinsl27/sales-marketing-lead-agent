#!/usr/bin/env bash
# Deploys Coolgen Lead Desk to Cloud Run. Run it in Google Cloud Shell from this folder:
#
#   ADMIN_EMAILS=you@gmail.com ./deploy.sh
#
# It asks once for a Gmail App Password so you get an email for every new sign-up (press Enter to skip).
# Optional settings (put them before ./deploy.sh):
#   NOTIFY_EMAILS=a@x.com,b@y.com     who gets sign-up emails (default: ADMIN_EMAILS)
#   SMTP_USER=sender@gmail.com        Gmail account that sends them (default: first ADMIN_EMAILS address)
#   REQUIRE_APPROVAL=true             new users wait for an admin instead of getting in straight away
#   ALLOWED_EMAIL_DOMAINS=a.com,b.com limit sign-ups to these domains (default: any email)
#   NOTIFY_WEBHOOK_URL=https://...    also post sign-ups to a Google Chat or Slack webhook
#   GOOGLE_CLIENT_ID=...              adds a "Continue with Google" button
#   REGION=asia-south1  GEMINI_MODEL=gemini-3.8-flash  PROJECT_ID=...
# Safe to run again: it only creates what's missing, then redeploys.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
if [ -z "$PROJECT_ID" ]; then echo "No project set. Run: gcloud config set project YOUR_PROJECT_ID"; exit 1; fi
: "${ADMIN_EMAILS:?Set ADMIN_EMAILS to the email of the first admin, e.g.  ADMIN_EMAILS=you@gmail.com ./deploy.sh}"
REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-coolgen-lead-desk}"
DOMAINS="${ALLOWED_EMAIL_DOMAINS:-}"
APPROVAL="${REQUIRE_APPROVAL:-false}"
MODEL="${GEMINI_MODEL:-gemini-3.8-flash}"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
NOTIFY_EMAILS="${NOTIFY_EMAILS:-$ADMIN_EMAILS}"
SMTP_USER="${SMTP_USER:-${ADMIN_EMAILS%%,*}}"
WEBHOOK="${NOTIFY_WEBHOOK_URL:-}"
SA="${SERVICE}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

echo "==> Enabling Google Cloud APIs (first run takes a minute)"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com aiplatform.googleapis.com secretmanager.googleapis.com

echo "==> Firestore database"
if ! gcloud firestore databases describe --database="(default)" >/dev/null 2>&1; then
  gcloud firestore databases create --database="(default)" --location="$REGION" --type=firestore-native
else
  echo "    already exists"
fi

echo "==> Service account for the app"
if ! gcloud iam service-accounts describe "$SA" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SERVICE" --display-name="Coolgen Lead Desk"
  sleep 10
fi
for ROLE in roles/datastore.user roles/aiplatform.user; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="$ROLE" --condition=None -q >/dev/null
done
# Source deploys build with the default compute service account; make sure it may build.
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role=roles/cloudbuild.builds.builder --condition=None -q >/dev/null || true

echo "==> Secrets"
grant () { gcloud secrets add-iam-policy-binding "$1" --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor >/dev/null; }
make_secret () {
  local name="$1" value="$2"
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic >/dev/null
    echo "    created $name"
  fi
  grant "$name"
}
make_secret cg-session-secret "$(openssl rand -base64 48 | tr -d '\n')"
make_secret cg-admin-setup-code "$(openssl rand -hex 6)"
SECRETS="SESSION_SECRET=cg-session-secret:latest,ADMIN_SETUP_CODE=cg-admin-setup-code:latest"

echo "==> Sign-up notifications by email"
if gcloud secrets describe cg-smtp-pass >/dev/null 2>&1 && [ "${RESET_SMTP:-}" != "1" ]; then
  echo "    using the saved Gmail App Password for $SMTP_USER (run with RESET_SMTP=1 to change it)"
else
  echo "    Emails are sent from $SMTP_USER to $NOTIFY_EMAILS."
  echo "    Create a Gmail App Password at https://myaccount.google.com/apppasswords (needs 2-Step Verification on)."
  read -r -s -p "    Paste the 16-letter App Password, or press Enter to skip: " SMTP_PASS_IN; echo
  SMTP_PASS_IN="${SMTP_PASS_IN// /}"
  if [ -n "$SMTP_PASS_IN" ]; then
    if gcloud secrets describe cg-smtp-pass >/dev/null 2>&1; then
      printf '%s' "$SMTP_PASS_IN" | gcloud secrets versions add cg-smtp-pass --data-file=- >/dev/null
    else
      printf '%s' "$SMTP_PASS_IN" | gcloud secrets create cg-smtp-pass --data-file=- --replication-policy=automatic >/dev/null
    fi
    echo "    saved"
  else
    echo "    skipped: new sign-ups will still show in the app's Team tab"
  fi
fi
if gcloud secrets describe cg-smtp-pass >/dev/null 2>&1; then grant cg-smtp-pass; SECRETS="$SECRETS,SMTP_PASS=cg-smtp-pass:latest"; fi

echo "==> Building and deploying to Cloud Run ($REGION)"
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --service-account "$SA" \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 3 \
  --cpu 1 --memory 512Mi --concurrency 80 --timeout 300 --cpu-throttling \
  --set-env-vars "^;^NODE_ENV=production;GOOGLE_CLOUD_PROJECT=${PROJECT_ID};ALLOWED_EMAIL_DOMAINS=${DOMAINS};REQUIRE_APPROVAL=${APPROVAL};ADMIN_EMAILS=${ADMIN_EMAILS};NOTIFY_EMAILS=${NOTIFY_EMAILS};SMTP_USER=${SMTP_USER};NOTIFY_WEBHOOK_URL=${WEBHOOK};GEMINI_MODEL=${MODEL};GEMINI_LOCATION=global;GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}" \
  --set-secrets "$SECRETS" \
  --quiet

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
CODE="$(gcloud secrets versions access latest --secret=cg-admin-setup-code)"
cat <<EOF

========================================================
 Coolgen Lead Desk is live:  $URL

 First admin: open the link, choose "Create an account",
 sign up with $ADMIN_EMAILS, open "I'm the first admin"
 and enter this setup code:  $CODE

 Share the link with your team. Each new sign-up is
 emailed to $NOTIFY_EMAILS (if you saved an App Password)
 and listed in the app's Team tab.
========================================================
EOF
