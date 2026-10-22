# Coolgen Lead Desk

A daily sales and lead-generation desk for the Coolgen Technologies team. It is built for SMB customers, with India as the first market and the Middle East second.

## What it does

| Tab | Purpose |
|---|---|
| **Today** | Personal daily targets (companies found, qualified, contacted), follow-ups due, team pipeline by stage |
| **Find leads** | Pick product × city × industry and get ready-made searches for buying signals: hiring (LinkedIn Jobs, Naukri, Naukrigulf, Bayt), directories (Google Maps, IndiaMART), growth news, intent posts, and a "why now" compliance hook per country |
| **Qualify** | Paste what you know about a company; Claude scores fit for Coolgen HR and Fin360, lists likely pains, who to contact, an opening line and discovery questions |
| **Write outreach** | Email, LinkedIn, WhatsApp, 3-step follow-up sequence, call script or objection reply, in English, Hindi, Hinglish, Arabic, Tamil, Telugu or Malayalam |
| **Pipeline** | Shared lead list with stages, owners, follow-up dates, duplicate warnings and CSV export |
| **Products & me** | Product descriptions Claude is allowed to use (editors only) and each person's signature |

## How it runs

`coolgen-lead-desk.html` is a Claude artifact page. Sign-in, the shared database, and the AI features (`window.claude`: `user`, `db`, `sample`, `downloads`) are provided by claude.ai when the page is opened there.

- **Login:** team members sign in with their own Claude accounts. Access is controlled from the artifact's **Share** menu:
  - **Contributor:** can add and update leads.
  - **Editor:** can also edit product details.
  - **Viewer:** read-only.
- **Data:**
  - Leads are stored in the artifact's shared store (`leads` collection).
  - Product details are stored at `config/main`.
  - Each person's signature is stored privately under `data/users/<id>/settings`.

If you open the file outside claude.ai (for example on GitHub Pages), only **Find leads** works. The rest needs the Claude runtime. To run it as a standalone web app, replace those calls with your own auth, a database, and a server-side Claude API call.

## Brand

Colours and fonts live as CSS tokens in the `:root` block at the top of the `<style>` tag. To apply the official Coolgen brand guidelines, swap the colour and font values there.
