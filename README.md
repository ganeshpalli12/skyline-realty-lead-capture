# Skyline Realty — Pre-Sales Lead Capture

A single-page lead capture form for a luxury real estate developer. Submissions are POSTed to a Next.js Route Handler which authenticates with Salesforce using the OAuth 2.0 Client Credentials flow and creates a `Lead` record. A downstream voice agent picks up the lead and dials the prospect.

Built with **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, **react-hook-form**, and **zod**. Deployable to Vercel as-is.

---

## Quick start

```bash
# 1. Install
npm install

# 2. Configure environment — create .env.local in the project root (see template below)

# 3. Run
npm run dev
# open http://localhost:3000
```

## Environment variables

Create a `.env.local` file at the project root (it's git-ignored) with these keys:

```
SF_INSTANCE_URL=https://YOUR-ORG.my.salesforce.com
SF_CLIENT_ID=REPLACE_WITH_YOUR_CONSUMER_KEY
SF_CLIENT_SECRET=REPLACE_WITH_YOUR_CONSUMER_SECRET
```

These are read **server-side only** by `app/api/submit-lead/route.ts`. They are never exposed to the browser.

### How to get Salesforce credentials

1. In Salesforce Setup, create a **Connected App** with OAuth enabled.
2. Add scopes `api` and `refresh_token, offline_access`.
3. Enable **Client Credentials Flow** and assign a "Run As" user with permissions to create Leads.
4. Copy the **Consumer Key** → `SF_CLIENT_ID` and **Consumer Secret** → `SF_CLIENT_SECRET`.
5. The `SF_INSTANCE_URL` is your My Domain URL, e.g. `https://acme.my.salesforce.com`.

### Required Salesforce custom fields on `Lead`

The route writes to these custom fields. Create them on the `Lead` object before going live:

| API Name                 | Type                |
| ------------------------ | ------------------- |
| `Project_Interest__c`    | Picklist / Text     |
| `Budget_Range__c`        | Picklist / Text     |
| `Configuration__c`       | Picklist / Text     |
| `Preferred_Channel__c`   | Picklist / Text     |
| `Qualification_Status__c`| Picklist / Text     |

Standard fields used: `FirstName`, `LastName`, `Email`, `Phone`, `Company` (set to `"Individual Buyer"`), `LeadSource` (set to `"Web"`), `Description` (only when `message` is provided).

## Deployment to Vercel

1. Push the repo to GitHub.
2. Import the project in Vercel.
3. Add `SF_INSTANCE_URL`, `SF_CLIENT_ID`, `SF_CLIENT_SECRET` as Environment Variables (Production + Preview).
4. Deploy.

## Project structure

```
app/
  layout.tsx                root layout, Google Fonts (Cormorant + Inter)
  page.tsx                  form view + success view
  globals.css               Tailwind + editorial field styling
  api/submit-lead/route.ts  serverless Route Handler -> Salesforce
tailwind.config.ts          cream / burgundy palette
```

## Notes

- All Salesforce calls happen server-side. The browser never sees the access token.
- The submit button is disabled until the form is valid; validation errors appear on blur.
- The phone field renders a `+91` prefix on the UI and is submitted as `+91 <digits>` to Salesforce.
- The success view shows a read-only summary of what was submitted and a fallback phone number.
