-- Schema for the tee-time PoC.
-- Run this once against your Supabase project (SQL editor).

-- =====================================================
-- Tables
-- =====================================================
create table public.lists (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  name text not null,
  owner_id uuid not null,
  constraint lists_pkey primary key (id),
  constraint lists_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete cascade
) tablespace pg_default;

create table public.todos (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  completed_at timestamp with time zone null,
  description text not null,
  completed boolean not null default false,
  created_by uuid null,
  completed_by uuid null,
  list_id uuid not null,
  constraint todos_pkey primary key (id),
  constraint todos_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null,
  constraint todos_completed_by_fkey foreign key (completed_by) references auth.users (id) on delete set null,
  constraint todos_list_id_fkey foreign key (list_id) references lists (id) on delete cascade
) tablespace pg_default;

-- =====================================================
-- PowerSync publication
-- =====================================================
create publication powersync for table lists, todos;

-- =====================================================
-- Row Level Security
-- =====================================================
alter table public.lists  enable row level security;
alter table public.todos  enable row level security;

create policy "owned lists" on public.lists for ALL using (
  auth.uid() = owner_id
);

create policy "todos in owned lists" on public.todos for ALL using (
  auth.uid() IN (
    SELECT lists.owner_id FROM lists WHERE (lists.id = todos.list_id)
  )
);
