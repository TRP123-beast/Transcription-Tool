-- Run this in your Supabase SQL editor

create table transcription_jobs (
  id uuid primary key,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  file_name text not null,
  transcript text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for listing jobs by date
create index transcription_jobs_created_at_idx on transcription_jobs (created_at desc);

-- Auto-update updated_at on row change
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger transcription_jobs_updated_at
  before update on transcription_jobs
  for each row execute function update_updated_at();
