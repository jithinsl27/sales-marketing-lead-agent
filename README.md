# Coolgen Lead Desk

Coolgen Lead Desk is the daily sales and lead-generation app for the Coolgen Technologies team. It targets SMB customers, with India first and the Middle East second.

It runs on **Google Cloud Run**, stores data in **Firestore**, and uses **Gemini 3.8 Flash** on Vertex AI for its AI features. Everything runs inside your own Google Cloud project, with no other services involved.

## What the team gets

| Tab | Purpose |
|---|---|
| **Today** | Personal daily targets (companies found, qualified, contacted), follow-ups due, team pipeline by stage |
| **Find leads** | Pick product × city × industry and get ready-made searches for buying signals: hiring (LinkedIn Jobs, Naukri, Naukrigulf, Bayt), directories (Google Maps, IndiaMART), growth news, intent posts, plus a "why now" compliance hook per country |
| **Qualify** | Paste what you know about a company; Gemini scores fit for Coolgen HR and Fin360, lists likely pains, who to contact, an opening line and discovery questions |
| **Write outreach** | Email, LinkedIn, WhatsApp, 3-step follow-up sequence, call script or objection reply, in English, Hindi, Hinglish, Arabic, Tamil, Telugu or Malayalam |
| **Pipeline** | Shared lead list with stages, owners, follow-up dates, duplicate warnings and CSV export |
| **Products & me** | Product details the AI may use (admins edit), each person's signature and password |
| **Team** (admins) | Everyone who signed up, newest first: roles (Admin / Member / Viewer), disable, reset password |

## Sign-up and notifications

- **Anyone with the link can sign up.** They create an account with any email address and a password, then use the app straight away.
- **You get notified of every new sign-up** with their name, email address, sign-up method and time:
  - **By email:** `deploy.sh` asks for a Gmail App Password and sends from that Gmail account to `NOTIFY_EMAILS`.
  - **In the Team tab:** new sign-ups are always listed there.
  - **By chat (optional):** set `NOTIFY_WEBHOOK_URL` to post each sign-up to a Google Chat or Slack webhook.
- **Removing someone:** disable them in the Team tab. Disabling, changing a role or resetting a password signs that person out everywhere.
- **Tightening access later (optional):**
  - Redeploy with `REQUIRE_APPROVAL=true` so new accounts must wait for your approval.
  - Set `ALLOWED_EMAIL_DOMAINS` to accept only certain domains.
- **First admin:** the address in `ADMIN_EMAILS` signs up with the one-time setup code that `deploy.sh` prints, so nobody else can claim it.
- **Passwords and sessions:** passwords are hashed with scrypt, and sessions are signed, HttpOnly cookies that last 14 days.

## Deploy from Google Cloud Shell

1. Open [Cloud Shell](https://shell.cloud.google.com) in your project. Billing must be enabled.
2. Get the code into Cloud Shell:
   ```bash
   git clone https://github.com/jithinsl27/sales-marketing-lead-agent.git
   cd sales-marketing-lead-agent
   ```
3. Before running the script, create a Gmail App Password so you receive sign-up emails:
   1. Open https://myaccount.google.com/apppasswords. Your account needs 2-Step Verification turned on.
   2. Create a password named "Lead Desk" and copy the 16 letters.
4. Deploy, using your own Gmail as the admin:
   ```bash
   ADMIN_EMAILS=you@gmail.com ./deploy.sh
   ```
   Paste the App Password when the script asks for it.
5. The script prints the **public app URL** and your **admin setup code**. Open the URL and choose **Create an account**. Sign up with the admin email, expand **I'm the first admin**, and paste the code.
6. Share the URL with your team.

To redeploy after changes, run `./deploy.sh` again with the same `ADMIN_EMAILS`. It reuses everything it created the first time.

## Kept cheap on purpose

- **Cloud Run:** scales to zero (max 3 instances, 1 vCPU, 512 MiB), so it costs nothing while idle. Small teams usually stay inside the free tier.
- **Firestore:** the app loads the full lead list once, then checks only for changes every minute while the tab is visible. User and config data are cached.
- **Gemini 3.8 Flash:**
  - Runs with a low thinking level and capped output.
  - Each person is limited to 40 AI calls per 10 minutes.
  - It uses the service account, so there is no API key to manage.
- **No other paid services:** no load balancer, Redis or VM. Sign-up emails go out over Gmail SMTP, which is free.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ADMIN_EMAILS` | — | First admin(s), comma-separated |
| `NOTIFY_EMAILS` | `ADMIN_EMAILS` | Who receives sign-up emails |
| `SMTP_USER` | first admin email | Gmail account that sends sign-up emails |
| `REQUIRE_APPROVAL` | `false` | `true` makes new accounts wait for an admin |
| `ALLOWED_EMAIL_DOMAINS` | any | Comma-separated domains allowed to sign up |
| `NOTIFY_WEBHOOK_URL` | — | Google Chat or Slack incoming-webhook URL |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Vertex AI model ID |
| `GEMINI_THINKING_LEVEL` | `low` | `low`, `medium`, `high`, or empty |
| `GOOGLE_CLIENT_ID` | — | Adds "Continue with Google" |

## Run locally

```bash
npm install
npm run dev     # http://localhost:8080 — in-memory data, sample AI replies
```
Sign up as `admin@example.com` with setup code `dev`.

## Troubleshooting

- **"allow-unauthenticated" refused:** an organisation policy blocks public services. An org admin must allow public Cloud Run access for this project.
- **No sign-up emails:**
  - Check the App Password, then rerun with `RESET_SMTP=1 ./deploy.sh`.
  - Check Cloud Run → coolgen-lead-desk → Logs for "signup notification failed".
- **AI errors:** make sure Gemini 3.8 Flash is enabled for the project in Vertex AI Model Garden. You can also set `GEMINI_MODEL` to another available model.
