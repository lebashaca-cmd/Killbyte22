create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  username text not null check (char_length(username) between 1 and 32),
  content text not null check (char_length(content) between 1 and 1000),
  room text not null default 'general' check (room in ('general', 'off-topic', 'gaming')),
  created_at timestamptz not null default now()
);

alter table public.chat_messages
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 32),
  bio text not null default '' check (char_length(bio) <= 280),
  avatar_url text not null default '' check (char_length(avatar_url) <= 2048),
  banner_url text not null default '' check (char_length(banner_url) <= 2048),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table public.user_profiles
  add column if not exists display_name text not null default 'Member',
  add column if not exists bio text not null default '',
  add column if not exists avatar_url text not null default '',
  add column if not exists banner_url text not null default '',
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists user_profiles_user_id_idx
  on public.user_profiles (user_id);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'owner')),
  created_at timestamptz not null default now()
);

alter table public.chat_messages
  add column if not exists room text not null default 'general'
  check (room in ('general', 'off-topic', 'gaming'));

create index if not exists chat_messages_created_at_idx
  on public.chat_messages (created_at desc);

create index if not exists chat_messages_room_created_at_idx
  on public.chat_messages (room, created_at desc);

alter table public.chat_messages enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;

drop policy if exists "Signed-in users can read profiles" on public.user_profiles;
create policy "Signed-in users can read profiles"
  on public.user_profiles
  for select
  to authenticated
  using (true);

drop policy if exists "Users can create their own profile" on public.user_profiles;
create policy "Users can create their own profile"
  on public.user_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own profile" on public.user_profiles;
create policy "Users can update their own profile"
  on public.user_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Signed-in users can read account roles" on public.user_roles;
create policy "Signed-in users can read account roles"
  on public.user_roles
  for select
  to authenticated
  using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'killbyte-profile-images',
  'killbyte-profile-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload their own profile images" on storage.objects;
create policy "Users can upload their own profile images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'killbyte-profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can view profile images" on storage.objects;
create policy "Users can view profile images"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'killbyte-profile-images');

drop policy if exists "Users can replace their own profile images" on storage.objects;
create policy "Users can replace their own profile images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'killbyte-profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'killbyte-profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Signed-in users can read chat messages" on public.chat_messages;
create policy "Signed-in users can read chat messages"
  on public.chat_messages
  for select
  to authenticated
  using (true);

drop policy if exists "Users can post as their own account" on public.chat_messages;
create policy "Users can post as their own account"
  on public.chat_messages
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and username = left(
      coalesce(
        nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'display_name'), ''),
        nullif(split_part(auth.jwt() ->> 'email', '@', 1), ''),
        'Member'
      ),
      32
    )
  );
