# Setting up Killbyte Chat

Killbyte accounts use Supabase Auth across the whole site. Visitors can browse without an account; signing in is required to use the `#general`, `#off-topic`, and `#gaming` chat rooms. The chat uses a Supabase Postgres table with Realtime. No passwords or service-role keys are stored in this site.

## 1. Create a Supabase project

Create a project at [supabase.com](https://supabase.com), then copy the project URL and its **publishable/anon** key from the project API settings.

Set `KILLBYTE_SUPABASE_URL` and `KILLBYTE_SUPABASE_ANON_KEY` in [chat-config.js](./chat-config.js). The URL should look like `https://your-project.supabase.co`. The anon key is intended to be public in a browser; **never** put a `service_role` or secret key in this file. Database row-level security is enabled by the SQL below.

## 2. Create the chat table and access policies

Open the Supabase SQL Editor and run the contents of [supabase-chat.sql](./supabase-chat.sql). This creates or upgrades the messages, message reactions, public profile, role, and site-lockdown tables, automatically assigns the Member role to new signups, sets up public profile-image storage and private chat-image storage (JPEG, PNG, GIF, or WebP up to 5 MB), and adds columns for text, image, GIF, and threaded replies. It also adds the room column (existing messages stay in `#general`), enables row-level security, lets signed-in users read messages, reactions, profiles, and role labels, and only lets users manage their own profiles or post as their own account name. Users may delete only their own chat messages and reactions. Users can have multiple role tags. Roles cannot be assigned from the browser; assign additional roles in the SQL Editor. Existing accounts can add profile details from the Account page. The SQL is safe to rerun on an existing chat table.

## 3. Configure KLIPY GIF search

Create an app and API key in the [KLIPY Partner Panel](https://partner.klipy.com/), then set `window.KILLBYTE_KLIPY_APP_KEY` in [chat-config.js](./chat-config.js). The key is used by the browser and is visible to site visitors. KLIPY limits testing keys to 100 API requests per hour; request production access in the Partner Panel when ready. The GIF picker uses KLIPY's [GIF search endpoint](https://docs.klipy.com/gifs-api/gifs-search-api.md) and records share events. Follow KLIPY's [integration requirements](https://docs.klipy.com/integration-requirements.md), including retaining direct media URLs and KLIPY attribution. Emoji and image upload work without a KLIPY key.

To make an account an owner, find its UUID in **Authentication → Users**, then run this in the SQL Editor (replace the UUID):

```sql
insert into public.user_role_assignments (user_id, role)
values ('YOUR_AUTH_USER_UUID', 'owner')
on conflict (user_id, role) do nothing;
```

Use `'admin'`, `'beta'`, or `'member'` to assign another tag. Always use `public.user_role_assignments` for role changes; the old `public.user_roles` table is legacy and only supports `'admin'` and `'owner'`. An account may have multiple role rows. New accounts receive `'member'` automatically. Only `'admin'` and `'owner'` grant access to the Admin panel. To remove an assigned role:

## Site lockdown

After applying the updated SQL, admins and owners can enable the site-wide four-digit visual gate and set or change its code from the Admin panel. The code is stored in a table that browser clients cannot read directly; database functions expose only the enabled state and verify submitted codes. The authenticated Admin panel remains available to admins and owners for recovery.

This overlay is a convenience gate, not a security boundary: the site is static, so page assets and public files are not protected by it. Do not use it to protect sensitive information or replace real authentication and server-side authorization.

```sql
delete from public.user_role_assignments
where user_id = 'YOUR_AUTH_USER_UUID' and role = 'owner';
```

## 4. Enable live message updates

In Supabase, open **Database → Publications**, select `supabase_realtime`, and enable both `public.chat_messages` and `public.chat_message_reactions`. Initial message history and reactions will load without this step, but new messages, replies, and reactions will not update live.

## 5. Configure account email redirects

In **Authentication → URL Configuration**, set the Site URL to the deployed Killbyte site and add its account page to the allowed redirect URLs if needed. For local development, allow the local origin you use to serve the site. If email confirmation is enabled, new users must confirm their email before signing in.

## 6. Build and deploy

Run `npm run build` and deploy the generated `dist` directory as usual. The **Account** link appears in the main navigation on every page; users can create an account or sign in there, then use the same session in Chat. Test by creating two accounts in separate browsers and sending messages between them.

The browser app intentionally does not offer guest chat or store passwords itself. Supabase handles account sessions; the public database key is safe to expose only because the table policies restrict access to authenticated users.
