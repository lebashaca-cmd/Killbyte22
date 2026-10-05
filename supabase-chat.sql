create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  username text not null check (char_length(username) between 1 and 32),
  content text not null check (char_length(content) between 1 and 1000),
  room text not null default 'general' check (room in ('general', 'off-topic', 'gaming')),
  created_at timestamptz not null default now()
);

alter table public.chat_messages
  add column if not exists message_type text not null default 'text',
  add column if not exists media_url text not null default '',
  add column if not exists media_path text not null default '',
  add column if not exists parent_message_id bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_messages_parent_message_id_fkey'
      and conrelid = 'public.chat_messages'::regclass
  ) then
    alter table public.chat_messages
      add constraint chat_messages_parent_message_id_fkey
      foreign key (parent_message_id) references public.chat_messages (id) on delete set null;
  end if;
end;
$$;

create table if not exists public.chat_message_reactions (
  message_id bigint not null references public.chat_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists chat_message_reactions_message_id_idx
  on public.chat_message_reactions (message_id);

alter table public.chat_messages
  drop constraint if exists chat_messages_message_type_check,
  add constraint chat_messages_message_type_check
    check (message_type in ('text', 'image', 'gif'));

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

create table if not exists public.user_role_assignments (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'beta', 'member')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function public.assign_default_member_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_role_assignments (user_id, role)
  values (new.id, 'member')
  on conflict (user_id, role) do nothing;
  return new;
end;
$$;

revoke all on function public.assign_default_member_role() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_assign_member on auth.users;
create trigger on_auth_user_created_assign_member
  after insert on auth.users
  for each row execute function public.assign_default_member_role();

insert into public.user_role_assignments (user_id, role)
select user_id, role
from public.user_roles
on conflict (user_id, role) do nothing;

delete from public.user_roles;

alter table public.chat_messages
  add column if not exists room text not null default 'general'
  check (room in ('general', 'off-topic', 'gaming'));

create index if not exists chat_messages_created_at_idx
  on public.chat_messages (created_at desc);

create index if not exists chat_messages_room_created_at_idx
  on public.chat_messages (room, created_at desc);

alter table public.chat_messages enable row level security;
alter table public.chat_message_reactions enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_role_assignments enable row level security;
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;
revoke all on public.user_role_assignments from anon, authenticated;
grant select on public.user_role_assignments to authenticated;

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

drop policy if exists "Signed-in users can read role assignments" on public.user_role_assignments;
create policy "Signed-in users can read role assignments"
  on public.user_role_assignments
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'killbyte-chat-images',
  'killbyte-chat-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Signed-in users can upload chat images" on storage.objects;
create policy "Signed-in users can upload chat images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'killbyte-chat-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Signed-in users can view chat images" on storage.objects;
create policy "Signed-in users can view chat images"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'killbyte-chat-images'  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'killbyte-chat-images',
  'killbyte-chat-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Signed-in users can upload chat images" on storage.objects;
create policy "Signed-in users can upload chat images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'killbyte-chat-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Signed-in users can view chat images" on storage.objects;
create policy "Signed-in users can view chat images"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'killbyte-chat-images');

drop policy if exists "Users can remove their own chat images" on storage.objects;
create policy "Users can remove their own chat images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'killbyte-chat-images'
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
    and message_type in ('text', 'image', 'gif')
    and (
      (message_type = 'text' and media_url = '' and media_path = '')
      or (
        message_type = 'image'
        and media_url = ''
        and media_path like auth.uid()::text || '/%'
      )
      or (
        message_type = 'gif'
        and media_path = ''
        and media_url ~ '^https://([a-z0-9-]+\.)?klipy\.com/'
      )
    )
    and username = left(
      coalesce(
        nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'display_name'), ''),
        nullif(split_part(auth.jwt() ->> 'email', '@', 1), ''),
        'Member'
      ),
      32
    )
    and (
      parent_message_id is null
      or exists (
        select 1
        from public.chat_messages parent_message
        where parent_message.id = chat_messages.parent_message_id
          and parent_message.room = chat_messages.room
      )
    )
  );

drop policy if exists "Users can delete their own chat messages" on public.chat_messages;
create policy "Users can delete their own chat messages"
  on public.chat_messages
  for delete
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.chat_message_reactions from anon, authenticated;
grant select, insert, delete on public.chat_message_reactions to authenticated;

drop policy if exists "Signed-in users can read chat message reactions" on public.chat_message_reactions;
create policy "Signed-in users can read chat message reactions"
  on public.chat_message_reactions
  for select
  to authenticated
  using (true);

drop policy if exists "Users can add their own chat message reactions" on public.chat_message_reactions;
create policy "Users can add their own chat message reactions"
  on public.chat_message_reactions
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.chat_messages target_message
      where target_message.id = chat_message_reactions.message_id
    )
  );

drop policy if exists "Users can remove their own chat message reactions" on public.chat_message_reactions;
create policy "Users can remove their own chat message reactions"
  on public.chat_message_reactions
  for delete
  to authenticated
  using (auth.uid() = user_id);
