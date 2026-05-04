-- Run this in Supabase: SQL Editor > New query > paste all > Run

create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  claim_num text,
  status text not null default 'active',
  vehicle text,
  vin text,
  plate text,
  insurance text,
  policy text,
  adjuster text,
  adj_phone text,
  adj_email text,
  customer text,
  est_amount text,
  paid text,
  date_in date,
  date_eta date,
  progress integer default 0,
  tech text,
  notes text,
  file_name text,
  file_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger claims_updated_at
  before update on claims
  for each row execute function update_updated_at();

insert into storage.buckets (id, name, public)
values ('estimates', 'estimates', true)
on conflict do nothing;

create policy "Public read estimates" on storage.objects
  for select using (bucket_id = 'estimates');

create policy "Public upload estimates" on storage.objects
  for insert with check (bucket_id = 'estimates');

create policy "Public update estimates" on storage.objects
  for update using (bucket_id = 'estimates');

alter table claims enable row level security;

create policy "Allow all on claims" on claims
  for all using (true) with check (true);
