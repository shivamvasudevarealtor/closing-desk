# Closing Desk

Private follow-up CRM for The Modern Real Estate Group. Installs on iPhone and Mac like an app.

- **This repo holds only the app's code. It holds no contacts.** Your contacts live in your own Supabase database (Canada Central), behind a login.
- Never put a `service_role` key, a database password, or a backup file in this repo.

## One-time setup (about 15 minutes)

### 1. Database (Supabase)
1. supabase.com > New project. Region: **Canada (Central)**. Save the database password in your password manager. You will not need it again.
2. SQL Editor > New query > paste all of `supabase/schema.sql` > Run. It should say "Success".
3. Authentication > Sign In / Providers > Email: turn **Allow new users to sign up** OFF. (Users you add yourself in step 4 still work.)
4. Authentication > Users > Add user > Create new user. Your email + a strong password. Tick **Auto Confirm User**.
5. Project Settings > API Keys: copy the **Project URL** and the **anon / publishable** key.

### 2. Connect the app
Open `config.js`, replace the two placeholder values with the URL and anon key, save. (The anon key is meant to be public. Your login and the database rules protect your data. Never paste the `service_role` key.)

### 3. Publish (GitHub Pages)
Repo > Settings > Pages > Source: **Deploy from a branch** > Branch: `main`, folder `/ (root)` > Save. After about a minute the site is at `https://<your-github-name>.github.io/closing-desk/`.

### 4. Install it
- **iPhone:** open the link in **Safari** > Share > **Add to Home Screen** > Add. Open it from the new icon and sign in once.
- **Mac:** Safari > File > **Add to Dock**. (Chrome: install icon in the address bar.)

### 5. Bring your contacts in
More > **Restore a backup** > choose your `closing-desk-backup-....json`. Goals and closed deals come back with it.

## Everyday use
- Today shows who to reach out to. Tap Talked / Messaged / No answer to log it and set the next date.
- Phone and laptop stay in sync live.
- If the connection drops, you see your last saved copy. Changes don't save until it's back, and the app tells you.
- More > **Download backup** after any big session. Keep that file somewhere private. It includes your notes.

## Email setup (v1.5, about 20 minutes, once)

**What it does.** You write one email, pick who gets it, and Closing Desk sends it from your own Gmail, one person at a time, at a safe speed. It never uses a BCC list. It stops by itself if Gmail says to slow down.

### The limits it follows
| Rule | Free Gmail | Google Workspace (paid) |
|---|---|---|
| Gmail's own limit (everything you send, 24 hours rolling) | about 500 | about 2,000 |
| Most this app will ever send in 24 hours | 200 | 500 |
| Your daily cap (you choose, default) | 100 | 100 |
| Warm-up (emails allowed on sending day 1, 2, 3, 4, 5, 6, 7) | 20, 30, 40, 60, 80, 100, 120 | same |
| Pause between emails | 20 to 45 seconds (Normal) or 45 to 90 (Gentle), random | same |
| Sending hours | 8 am to 8 pm (you can change) | same |
| Skip anyone emailed in the last | 30 days | same |

Your normal Gmail use counts toward Gmail's limit too, which is why the app stays far under it. If Gmail answers "rate limit", sending pauses for an hour, the cap is cut in half, and nothing is retried right away. Five rejected addresses in a row also pause everything. To use the paid limits later: Email settings > Gmail account type > Google Workspace.

### 1. Database (once)
Supabase > SQL Editor > New query > paste all of `supabase/email.sql` > Run. This lets the unsubscribe page mark a contact as unsubscribed, and nothing else. (A fresh database set up with the current `schema.sql` already has it.)

### 2. Google Cloud (once)
1. console.cloud.google.com > create a project (name it Closing Desk).
2. APIs & Services > Library > **Gmail API** > Enable.
3. APIs & Services > OAuth consent screen (Google Auth Platform) > User type **External** > fill in the app name and your email. Publishing status stays **Testing**. Add your own Gmail address under **Test users**.
4. Data access / Scopes: add `.../auth/gmail.send` and `.../auth/userinfo.email`. Nothing else.
5. Clients > Create client > **Web application**. Under **Authorized JavaScript origins** add `https://<your-github-name>.github.io` (no path, no slash at the end). Create. Copy the **Client ID** (not a secret).

### 3. In the app
1. Email tab > Set up email. Paste the Client ID. Fill in your name, brokerage line and **mailing address** (required by Canadian anti-spam law in every email).
2. Tap **Test unsubscribe link**. It must say Working.
3. Tap **Connect Gmail**. Google will say the app is not verified. That is expected for your own private app: Advanced > Go to Closing Desk (unsafe) > Continue, and tick the box that allows sending email.
4. Lists > Select > pick people > **Email consent** to record who agreed (see below).
5. Email > New campaign. Pick a starter or write your own, choose who, **Send a test to me**, then Start sending.

### Good to know
- **Keep the page open** while it sends (a laptop is best; a phone sleeps). The Google sign-in lasts about an hour, so tap Connect Gmail again when it asks.
- It waits by itself for the daily cap, your sending hours and Gmail's pause, as long as the page stays open. A big list simply takes several days.
- If the app is closed mid-campaign it stays put until you open it, tap Connect Gmail and Resume. Nothing is sent twice.
- If an email might or might not have gone out (network trouble), the app stops and lists it under "Not sure if these went out". Check your Gmail Sent folder and tell it which.
- Unsubscribes are saved on the contact. People can also use the Unsubscribe button Gmail shows; that one sends you an email, so mark them unsubscribed on their contact.

### Consent and the law (CASL), plain language, not legal advice
- Every person must be marked **Said yes** (express, does not expire), **Client** (about 2 years from the closing date) or **Asked me** (about 6 months from the day they contacted you). People without a mark are skipped. You are the one who has to prove it, so only mark people who truly fit.
- Every email carries your name, brokerage, mailing address and an unsubscribe link automatically. Unsubscribes must be honoured within 10 business days; here it is immediate.
- Check the brokerage line wording and your email content with your brokerage's compliance contact (RECA advertising rules). The app warns about words like "best", "#1" and "guaranteed".

## Tell Claude setup (v1.6, about 10 minutes, once)

**What it does.** A box at the top of Today. Type a quick note ("Met Harpreet at the show home, 403 555 0147, wants a 3-bed duplex in Airdrie under 550k, call her Friday") and Claude suggests what to save: a new contact, a note in a client's history, a follow-up date, a buyer profile, a change to a detail, a to-do, or an idea for your workspace. **Nothing is saved until you tap Apply.** Changes to details you already saved, and possible duplicates, start unticked.

**Where it runs.** Your note goes from the app to a small function in your own Supabase project, which asks Claude (Anthropic's API) and sends the suggestions back. The function never writes contacts. Your Anthropic key lives only in Supabase, never in this repo or the browser.

**Cost.** Each note uses Claude Opus 5.5 and costs roughly 2 to 5 cents, billed by Anthropic. The app shows the approximate cost on every note. Set a monthly limit in the Anthropic Console.

### 1. Database
Supabase > SQL Editor > New query > paste all of `supabase/tell-claude.sql` > Run. It adds three private tables: `inbox` (your notes), `tasks` (to-dos) and `requests` (workspace ideas).

### 2. Anthropic API key
1. console.anthropic.com > sign in > Billing: add a small credit balance and set a monthly spend limit.
2. API keys > Create key. Name it Closing Desk. Copy it (it starts with `sk-ant-`).
3. Supabase > Edge Functions > Secrets > Add new secret. Name: `ANTHROPIC_API_KEY`. Value: the key. Save. Never put this key anywhere else.

### 3. The function
Supabase > Edge Functions > Deploy a new function > Via Editor. Name it exactly `tell-claude`. Replace the sample code with all of `supabase/functions/tell-claude/index.ts` > Deploy. Leave JWT verification on (only you, signed in, can use it).

### 4. Try it
Open Closing Desk > Today > Tell Claude. The first note confirms everything works. If something is missing, the app says which step.

## Updating the app
Change files in the repo, commit to `main`. Open the app twice (it updates in the background). If a phone seems stuck on an old version, close the app fully and reopen it.

## Files
| File | What it is |
|---|---|
| `index.html`, `app.css`, `app.js` | The app screens and logic |
| `supa.js` | Everything that talks to the database (login, saving, live sync) |
| `gmail.js` | Google sign-in and sending through the Gmail API (builds the message, nothing else) |
| `email.js` | The Email tab: who may be emailed, daily cap, warm-up, pacing, pause/stop rules |
| `unsub.html`, `unsub.js` | The page a recipient opens from the unsubscribe link |
| `config.js` | Your Supabase URL and public key |
| `tell.js` | The Tell Claude box on Today: saves your note, asks the function, shows suggestions, applies what you tick |
| `supabase/tell-claude.sql` | Tables for Tell Claude, run once |
| `supabase/functions/tell-claude/index.ts` | The Supabase function that asks Claude (holds no data, writes nothing) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Makes it installable and able to open with a weak signal |
| `vendor/supabase.js` | supabase-js 2.117.3 (MIT), saved locally so the app does not depend on a third-party host |
| `supabase/schema.sql` | Database setup, run once (already includes `email.sql`) |
| `supabase/email.sql` | Only the email part of the setup. Run this one if your database was set up before v1.5 |

## What's inside (v1.6)
- **Tell Claude (v1.6):** a box on Today. Claude turns quick notes into suggested contacts, notes, follow-ups, buyer profiles, to-dos and workspace ideas; you apply what you want. See "Tell Claude setup".
- **Email (v1.5):** a tab for emailing many people through your own Gmail without getting blocked. See "Email setup" below.
- **Today:** goals, last-7-days strip, Moments this week (birthdays and home anniversaries), and the daily follow-up list.
- **Buyer profiles:** open a contact > Add buyer profile (budget, areas, home type, pre-approval, timeline). Lists > **Match buyers** finds who fits a home.
- **Bell (v1.4):** top right. Shows what changed in every release; the red number counts releases you have not opened.
- **Pipeline (v1.3):** two boards with a Buyers / Sellers toggle. Buyers: Cold, Engaged, Searching, Under contract, Closed. Sellers: Cold, Consult set, Listed, Under contract, Closed. A contact's **Type** (buyer, investor, seller) decides the board. Arrows move a card, or drag it on a computer. Moving to Closed records the deal for your yearly goal. "Needs a type" lists new or untyped leads with one-tap Buyer / Seller buttons. **+ Add** picks people from your contacts.
- **Family (v1.2):** open a contact > Family. Add relatives with a relationship and birthday; their birthdays show in Moments.
- **Scorecard (More):** leads, meetings, deals and ad spend by source, with cost per lead.

## Releasing a change
1. Add an entry at the **top** of `RELEASES` in `app.js` (version, date, title, short plain-language bullets).
2. Set `APP_VERSION` to the same number.
3. Commit and push. The bell shows a red number on every device that has not opened that release yet.

## Not built yet
WhatsApp Business API and mass WhatsApp. The WhatsApp button uses click-to-chat with a prefilled message for now.
