begin;

create table if not exists public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null check (document_type in ('drivers_license','identification','insurance','vehicle_registration')),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/heic','application/pdf')),
  file_size integer not null check (file_size > 0 and file_size <= 10485760),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists driver_documents_driver_created_idx
  on public.driver_documents(driver_id, created_at desc);

drop trigger if exists driver_documents_set_updated_at on public.driver_documents;
create trigger driver_documents_set_updated_at
  before update on public.driver_documents
  for each row execute function public.set_updated_at();

alter table public.driver_documents enable row level security;

drop policy if exists driver_documents_select_self on public.driver_documents;
create policy driver_documents_select_self on public.driver_documents
  for select to authenticated using (driver_id = auth.uid());

grant select on public.driver_documents to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-documents',
  'driver-documents',
  false,
  10485760,
  array['image/jpeg','image/png','image/heic','application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
