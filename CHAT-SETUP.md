# Setting up Killbyte Chat

Killbyte accounts use Supabase Auth across the whole site. Visitors can browse without an account; signing in is required to use the `#general`, `#off-topic`, and `#gaming` chat rooms. The chat uses a Supabase Postgres table with Realtime. No passwords or service-role keys are stored in this site.

## 1. Create a Supabase project

Create a project at [supabase.com](https://supabase.com), then copy the project URL and its **publishable/anon** key from the project API settings.

Set `KILLBYTE_SUPABASE_URL` and `KILLBYTE_SUPABASE_ANON_KEY` in [chat-config.js](./chat-config.js). The URL should look like `https://your-project.supabase.co`. The anon key is intended to be public in a browser; **never** put a `service_role` or secret key in this file. Database row-level security is enabled by the SQL below.

## 2. Create the chat table and access policies

Open the Supabase SQL Editor and run the contents of [supabase-chat.sql](./supabase-chat.sql). This creates or upgrades the messages, public profile, and role tables, automatically assigns the Member role to new signups, sets up public profile-image storage (JPEG, PNG, GIF, or WebP up to 5 MB), adds the room column (existing messages stay in `#general`), enables row-level security, lets signed-in users read messages, profiles, and role labels, and only lets users manage their own profiles or post as their own account name. Users can have multiple role tags. Roles cannot be assigned from the browser; assign additional roles in the SQL Editor. Existing accounts can add profile details from the Account page. The SQL is safe to rerun on an existing chat table.

To make an account an owner, find its UUID in **Authentication → Users**, then run this in the SQL Editor (replace the UUID):

```sql
insert into public.user_role_assignments (user_id, role)
values ('YOUR_AUTH_USER_UUID', 'owner')
on conflict (user_id, role) do nothing;
```

Use `'admin'`, `'beta'`, or `'member'` to assign another tag. An account may have multiple role rows. Only `'admin'` and `'owner'` grant access to the Admin panel. To remove an assigned role:

```sql
delete from public.user_role_assignments
where user_id = 'YOUR_AUTH_USER_UUID' and role = 'owner';
```

## 3. Enable live message updates

In Supabase, open **Database → Publications**, select `supabase_realtime`, and enable `public.chat_messages`. The initial message history will load without this step, but the room will not receive live updates.

## 4. Configure account email redirects

In **Authentication → URL Configuration**, set the Site URL to the deployed Killbyte site and add its account page to the allowed redirect URLs if needed. For local development, allow the local origin you use to serve the site. If email confirmation is enabled, new users must confirm their email before signing in.

## 5. Build and deploy

Run `npm run build` and deploy the generated `dist` directory as usual. The **Account** link appears in the main navigation on every page; users can create an account or sign in there, then use the same session in Chat. Test by creating two accounts in separate browsers and sending messages between them.

The browser app intentionally does not offer guest chat or store passwords itself. Supabase handles account sessions; the public database key is safe to expose only because the table policies restrict access to authenticated users.
