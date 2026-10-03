# Setting up Killbyte Chat

Killbyte Chat uses Supabase Auth for accounts and a Supabase Postgres table with Realtime for the shared `#general` room. No passwords or service-role keys are stored in this site.

## 1. Create a Supabase project

Create a project at [supabase.com](https://supabase.com), then copy the project URL and its **publishable/anon** key from the project API settings.

Set `KILLBYTE_SUPABASE_URL` and `KILLBYTE_SUPABASE_ANON_KEY` in [chat-config.js](./chat-config.js). The URL should look like `https://your-project.supabase.co`. The anon key is intended to be public in a browser; **never** put a `service_role` or secret key in this file. Database row-level security is enabled by the SQL below.

## 2. Create the chat table and access policies

Open the Supabase SQL Editor and run the contents of [supabase-chat.sql](./supabase-chat.sql). This creates the messages table, enables row-level security, lets signed-in users read messages, and only lets a user post as their own account name.

## 3. Enable live message updates

In Supabase, open **Database → Publications**, select `supabase_realtime`, and enable `public.chat_messages`. The initial message history will load without this step, but the room will not receive live updates.

## 4. Configure account email redirects

In **Authentication → URL Configuration**, set the Site URL to the deployed Killbyte site and add its chat page to the allowed redirect URLs if needed. For local development, allow the local origin you use to serve the site. If email confirmation is enabled, new users must confirm their email before signing in.

## 5. Build and deploy

Run `npm run build` and deploy the generated `dist` directory as usual. `chat-config.js` is included in the static build. Test by creating two accounts in separate browsers and sending messages between them.

The browser app intentionally does not offer guest chat or store passwords itself. Supabase handles account sessions; the public database key is safe to expose only because the table policies restrict access to authenticated users.
