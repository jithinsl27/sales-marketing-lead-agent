# Coolgen Lead Desk

Coolgen Lead Desk is the daily sales and lead-generation app for the Coolgen Technologies team. It targets SMB customers, with India first and the Middle East second.

It runs on **Google Cloud Run**, stores data in **Firestore**, and uses **Gemini 3.8 Flash** on Vertex AI for its AI features.

## What the team gets

| Tab | Purpose |
|---|---|
| **Today** | Personal daily targets (companies found, qualified, contacted), follow-ups due, team pipeline by stage |
| **Find leads** | Pick product × city × industry and get ready-made searches for buying signals: hiring (LinkedIn Jobs, Naukri, Naukrigulf, Bayt), directories (Google Maps, IndiaMART), growth news, intent posts, plus a "why now" compliance hook per country |
| **Qualify** | Paste what you know about a company; the AI scores fit for Coolgen HR and Fin360, lists likely pains, who to contact, an opening line and discovery questions |
| **Write outreach** | Email, LinkedIn, WhatsApp, 3-step follow-up sequence, call script or objection reply, in English, Hindi, Hinglish, Arabic, Tamil, Telugu or Malayalam |
| **Pipeline** | Shared lead list with stages, owners, follow-up dates, duplicate warnings and CSV export |
| **Products & me** | Product details the AI may use (admins edit), each person's signature and password |
| **Team** (admins) | Approve sign-up requests, set roles (Admin / Member / Viewer), disable people, reset passwords |

## Sign-in rules

- **Allowed addresses:** only `@gmail.com` addresses can request access. `@coolgentech.com` and every other domain are refused. To change this, set `ALLOWED_EMAIL_DOMAINS`.
- **Approval:** every new account stays **pending until an admin approves it** in the Team tab. Anyone can own a Gmail address, so approval is what keeps strangers out.
- **First admin:** the email in `ADMIN_EMAILS` signs up with the one-time **admin setup code** that `deploy.sh` prints. Without the code, nobody else can register that address as admin.
- **Google sign-in (optional):** set `GOOGLE_CLIENT_ID` to add a "Continue with Google" button. Google confirms the person owns the address, but admin approval still applies.
- **Security:**
  - Passwords are hashed with scrypt.
  - Sessions are signed, HttpOnly cookies lasting 14 days.
  - Disabling someone, changing their role, or resetting their password signs them out everywhere.

## Deploy (Google Cloud Shell, about 10 minutes)

1. Open [Cloud Shell](https://shell.cloud.google.com) in the Google Cloud project you want to use. Billing must be enabled on the project.
2. Get the code, then run the script:
   ```bash
   git clone https://github.com/jithinsl27/sales-marketing-lead-agent.git
   cd sales-marketing-lead-agent
   gcloud config set project YOUR_PROJECT_ID
   ADMIN_EMAILS=you@gmail.com ./deploy.sh
   ```
   If you uploaded the zip instead of using GitHub, unzip it in Cloud Shell and `cd` into the folder.
3. The script enables the APIs, creates the Firestore database (in Mumbai), a service account and the secrets, then builds and deploys. At the end it prints the **app URL** and the **admin setup code**.
4. Open the URL and choose **Request access**. Sign up with the admin email, expand **I'm the first admin**, and paste the code.
5. Share the URL with your team. They click **Request access**, and you approve them in the **Team** tab.

To redeploy after changes, run the same command again.

### Optional: "Continue with Google" button
1. Go to Google Cloud Console → APIs & Services → Credentials.
2. Create an **OAuth client ID** of type *Web application*.
3. Add your Cloud Run URL under *Authorized JavaScript origins*.
4. Redeploy with the client ID:
   ```bash
   ADMIN_EMAILS=you@gmail.com GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com ./deploy.sh
   ```

## Kept cheap on purpose

- **Cloud Run:** scales to zero (`min-instances 0`, max 3, 1 vCPU, 512 MiB), so you pay nothing while nobody is using it. Small teams usually stay inside the free tier.
- **Firestore:** the app downloads the full lead list once, then every minute asks only for changes. That uses 1 read plus the changed leads, and only while the tab is visible. User records and product config are cached for 60 s.
- **Gemini 3.8 Flash:**
  - Runs with a low thinking level and capped output.
  - Each person is limited to 40 AI calls per 10 minutes.
  - It uses the service account, so there is no API key to store.
- **No other paid services:** no load balancer, no Redis and no VM.

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `ALLOWED_EMAIL_DOMAINS` | `gmail.com` | Comma-separated email domains allowed to request access |
| `ADMIN_EMAILS` | — | First admin(s); comma-separated |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Vertex AI model ID |
| `GEMINI_LOCATION` | `global` | Vertex AI location |
| `GEMINI_THINKING_LEVEL` | `low` | `low`, `medium`, `high`, or empty to omit |
| `GOOGLE_CLIENT_ID` | — | Enables Google sign-in |
| `SESSION_SECRET`, `ADMIN_SETUP_CODE` | from Secret Manager | Set by `deploy.sh` |

## Run locally

```bash
npm install
npm run dev     # http://localhost:8080 — in-memory data, fake AI
```
Sign up as `admin@gmail.com` with setup code `dev`.

## Troubleshooting

- **"allow-unauthenticated" refused:** your organisation has a policy blocking public services. Ask the org admin to allow public Cloud Run access for this project.
- **AI errors mentioning the model:** check that Gemini 3.8 Flash is enabled for your project in Vertex AI Model Garden. You can also set `GEMINI_MODEL` to another available model and redeploy.
- **Build permission errors:** rerun `deploy.sh`. It grants the build role to the default compute service account.

## Also in this repo

`claude-artifact/coolgen-lead-desk.html` is the same desk as a Claude artifact page. It works only when opened inside claude.ai.
