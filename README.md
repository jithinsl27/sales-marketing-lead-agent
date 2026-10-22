# Drops Lead Desk

Drops Lead Desk is the daily sales and lead-generation app for the Drops team. It targets SMB customers, with India first and the Middle East second.

It runs on **Google Cloud Run**, stores data in **Firestore**, uses **Gemini 3.8 Flash** on Vertex AI for its AI features, and uses **Cloud Scheduler** to run Extract every 30 minutes. Everything runs inside your own Google Cloud project.

## What the team gets

| Tab | Purpose |
|---|---|
| **Today** | Personal daily targets (companies found, qualified, contacted), follow-ups due, team pipeline by stage |
| **Extract** | Every 30 minutes, finds public posts from people who want a freelancer or agency to build software, apps, websites or AI solutions, or who are looking for HR, CRM or finance software. Each find is added to a table with the date and time, requirement, name and company (if stated), location, contact details as posted, and source link. The team adds **Remarks**, sets a **Status**, writes a **personalised message** (DM, reply, email or proposal) and can add the row to the pipeline |
| **Find leads** | Pick product × city × industry and get ready-made searches for buying signals: hiring (LinkedIn Jobs, Naukri, Naukrigulf, Bayt), directories (Google Maps, IndiaMART), growth news, intent posts, plus a "why now" compliance hook per country |
| **Qualify** | Paste what you know about a company; Gemini scores fit for Drops HR and Fin360, lists likely pains, who to contact, an opening line and discovery questions |
| **Write outreach** | Email, LinkedIn, WhatsApp, 3-step follow-up sequence, call script or objection reply, in English, Hindi, Hinglish, Arabic, Tamil, Telugu or Malayalam |
| **Pipeline** | Shared lead list with stages, owners, follow-up dates, duplicate warnings and CSV export |
| **Products & me** | Product details the AI may use (admins edit), each person's signature and password |
| **Team** (admins) | Everyone who signed up, newest first: roles (Admin / Member / Viewer), disable, reset password |

## How Extract works

- **Two sources:**
  - **Gemini with Google Search grounding:** finds public posts on LinkedIn (pages Google has indexed), Reddit, Quora, X, forums and other open sites.
  - **Freelancer.com's public projects feed.**
- **No direct LinkedIn scraping:** LinkedIn's terms forbid it and it gets blocked, so LinkedIn posts come only from Google's index.
- **Checked sources:** every web find must point to a page that Google Search actually returned. Anything the model can't back with a search result is discarded.
- **Contact details** are copied only as the poster published them in the post. Nothing is looked up about anyone, and no street or home addresses are stored.
- **No duplicates:** each source URL is stored once, so the table only grows with new records.
- **Schedule and cost:**
  - Cloud Scheduler calls the app every 30 minutes with a Google-signed token. Only that signed token, or an admin pressing **Run now**, can start a run.
  - Each run does one Google-grounded search (rotating through the 4 needs and India → Gulf → global) plus a few Freelancer.com queries. That's about 1,440 grounded prompts a month.
  - Gemini 3 includes 5,000 grounding queries a month free, then $14 per 1,000. A single prompt can trigger more than one query.
  - To search more per run, set `EXTRACT_WEB_SEARCHES_PER_RUN` (1–4).

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
| `EXTRACT_WEB_SEARCHES_PER_RUN` | `1` | Google-grounded searches per Extract run (1–4) |
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
  - Check Cloud Run → drops-lead-desk → Logs for "signup notification failed".
- **Extract shows no records:** open Cloud Scheduler → `drops-extract` and check the last run result. Cloud Run logs show `extract run` lines with any source errors.
- **AI errors:** make sure Gemini 3.8 Flash is enabled for the project in Vertex AI Model Garden. You can also set `GEMINI_MODEL` to another available model.
