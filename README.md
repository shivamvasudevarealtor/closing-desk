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

## Updating the app
Change files in the repo, commit to `main`. Open the app twice (it updates in the background). If a phone seems stuck on an old version, close the app fully and reopen it.

## Files
| File | What it is |
|---|---|
| `index.html`, `app.css`, `app.js` | The app screens and logic |
| `supa.js` | Everything that talks to the database (login, saving, live sync) |
| `config.js` | Your Supabase URL and public key |
| `sw.js`, `manifest.webmanifest`, `icons/` | Makes it installable and able to open with a weak signal |
| `vendor/supabase.js` | supabase-js 2.117.3 (MIT), saved locally so the app does not depend on a third-party host |
| `supabase/schema.sql` | Database setup, run once |

## What's inside (v1.4)
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
WhatsApp Business API, bulk email and mass messaging. The WhatsApp button uses click-to-chat with a prefilled message for now.
