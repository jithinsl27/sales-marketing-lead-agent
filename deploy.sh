#!/usr/bin/env bash
# Deploys Coolgen Lead Desk to Cloud Run. Run it in Google Cloud Shell from this folder:
#
#   ADMIN_EMAILS=you@gmail.com ./deploy.sh
#
# Optional: PROJECT_ID, REGION (default asia-south1 / Mumbai), ALLOWED_EMAIL_DOMAINS (default gmail.com),
#           GEMINI_MODEL (default gemini-3.8-flash), GOOGLE_CLIENT_ID (enables "Continue with Google").
# Safe to run again: it only creates what's missing, then redeploys.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
if [ -z "$PROJECT_ID" ]; then echo "No project set. Run: gcloud config set project YOUR_PROJECT_ID"; exit 1; fi
: "${ADMIN_EMAILS:?Set ADMIN_EMAILS to the email of the first admin, e.g.  ADMIN_EMAILS=you@gmail.com ./deploy.sh}"
REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-coolgen-lead-desk}"
DOMAINS="${ALLOWED_EMAIL_DOMAINS:-gmail.com}"
MODEL="${GEMINI_MODEL:-gemini-3.8-flash}"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
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
make_secret () {
  local name="$1" value="$2"
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic >/dev/null
    echo "    created $name"
  fi
  gcloud secrets add-iam-policy-binding "$name" --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor >/dev/null
}
make_secret cg-session-secret "$(openssl rand -base64 48 | tr -d '\n')"
make_secret cg-admin-setup-code "$(openssl rand -hex 6)"

echo "==> Building and deploying to Cloud Run ($REGION)"
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --service-account "$SA" \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 3 \
  --cpu 1 --memory 512Mi --concurrency 80 --timeout 300 --cpu-throttling \
  --set-env-vars "^;^NODE_ENV=production;GOOGLE_CLOUD_PROJECT=${PROJECT_ID};ALLOWED_EMAIL_DOMAINS=${DOMAINS};ADMIN_EMAILS=${ADMIN_EMAILS};GEMINI_MODEL=${MODEL};GEMINI_LOCATION=global;GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}" \
  --set-secrets "SESSION_SECRET=cg-session-secret:latest,ADMIN_SETUP_CODE=cg-admin-setup-code:latest" \
  --quiet

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
CODE="$(gcloud secrets versions access latest --secret=cg-admin-setup-code)"
cat <<EOF

========================================================
 Coolgen Lead Desk is live:  $URL

 First admin: open the link, choose "Request access",
 sign up with $ADMIN_EMAILS, open "I'm the first admin"
 and enter this setup code:  $CODE

 Then approve your team in the Team tab.
========================================================
EOF
