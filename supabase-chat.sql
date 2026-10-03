create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  username text not null check (char_length(username) between 1 and 32),
  content text not null check (char_length(content) between 1 and 1000),
  room text not null default 'general' check (room in ('general', 'off-topic', 'gaming')),
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
