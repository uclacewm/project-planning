# CEWM Project Planning

Internal planning page for the UCLA Center for East-West Medicine team: timeline, events, calendar, board,
deadlines, weekly meeting notes, action items, fundraising (editors only), impact data and archived programs.

- **Page:** static HTML/JavaScript, hosted on GitHub Pages (no build step).
- **Data and sign-in:** the Center's existing Supabase project. All tables start with `planning_` so they never
  touch the Center's other pages.
- **No project data lives in this repository.** Everything is loaded from Supabase after sign-in, and the database
  only answers people on the access list. `js/demo-data.js` is a cleaned sample for the "Preview with sample data" link
  (no internal notes, donors or student names).

## Who can do what

| Account | Role | Can |
| --- | --- | --- |
| Angela, Anna, Annie (personal mednet logins) | Editor | View and edit everything, including Fundraising |
| Center shared mednet account | Viewer | View everything except Fundraising; can't change anything |

The list lives in the `planning_members` table. The roster used for Lead and Owner lists is the `planning_people` table. To add or remove someone: Supabase → Table Editor →
`planning_members`, add a row (email in lower case, role `editor` or `viewer`), then create their login under
Authentication → Users. Removing the row removes access, even if the login still exists.

Every change records who made it and when (`updated_by`, `updated_at`), and a full log is kept in `planning_history`
(shown as "Change history" at the bottom of each project's form).

## One-time setup

1. **Logins** (Supabase → Authentication → Users → Add user → Create new user): add each person on the `planning_members` list with a password
   and tick "Auto confirm user". Share the viewer password only with Center staff, and change it once a year and
   when someone leaves.
2. **Password reset links** (Supabase → Authentication → URL Configuration): set Site URL to
   `https://uclacewm.github.io/project-planning/` and add the same address under Redirect URLs.
3. **Leaked-password protection** (Supabase → Authentication → Providers/Policies → Password security): turn on
   "Prevent use of leaked passwords".
4. **Brand files** (Supabase → Storage → `planning-assets` bucket, private): upload
   - `logo.png`
   - a folder `fonts/` containing `Balboa-Medium.ttf`, `TradeGothicNextLTPro-Regular.ttf`,
     `TradeGothicNextLTPro-BoldCondensed.ttf`, `P22MackinacPro-Medium.otf`

   The fonts are licensed for Center use only, so they are kept in private storage and loaded only after sign-in.
   Until they're uploaded the page uses similar system fonts.
5. **Publish the page** (GitHub → this repo → Settings → Pages): Source "Deploy from a branch", branch `main`,
   folder `/ (root)`. The page appears at `https://uclacewm.github.io/project-planning/`.

## How the meeting tab works

- The weekly admin meeting is one repeating meeting. Pick a date in the Meeting tab and click **Start meeting notes**.
- Each project (plus Fundraising, Events, Team & admin, Other) is a topic with quick-status buttons, an Update box and a
  Decision box. Notes save automatically, and everyone signed in sees them live, with who is editing which topic.
- New action items need an owner and a due date. Open items carry over to every following meeting until checked off.
- **Close meeting** lists anything incomplete (short notes, items with no owner, flagged projects not discussed),
  then saves a summary you can copy into an email.

## Calendar

- **Download for Outlook (.ics)** saves all meetings, events and deadlines as a file Outlook can open.
- **Import .ics** (editors) adds meetings from an Outlook export or invite. Repeating meetings keep their schedule.

## Files

```
index.html            page shell
css/app.css           styles (UCLA CEWM brand colors)
js/config.js          Supabase address and public anon key, brand file names
js/store.js           sign-in, loading, saving, live updates, who is online
js/model.js           groups, stages, deadlines, alerts, repeating meetings
js/views.js           the tabs
js/forms.js           edit forms
js/io.js              Excel export, .ics download and import
js/app.js             start-up and click handling
js/demo-data.js       cleaned sample data for the preview link
supabase/schema.sql   database tables, security rules, history log (already applied)
```

The anon key in `js/config.js` is meant to be public; the security rules decide what it can do. Never commit the
`service_role` key.

## Ideas for later

- A live "Subscribe in Outlook" feed (needs a small Supabase Edge Function).
- Email reminders to owners of overdue action items.
- Box folder and Qualtrics response counts per project.
- Research projects from the research associates.
