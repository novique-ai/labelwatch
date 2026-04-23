-- LabelWatch contact-form messages.
-- Upstream: app/api/contact/route.ts POST handler.
-- Email is mirrored to support@novique.ai via Resend; this table is for
-- analysis (categorization, response-rate tracking, recurring topics).

create table if not exists public.contact_messages (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null,
  firm          text,
  category      text not null
                  check (category in (
                    'general',
                    'sales',
                    'support',
                    'feedback',
                    'research',
                    'partnership',
                    'other'
                  )),
  message       text not null,
  user_agent    text,
  referrer      text,
  ip_hash       text,
  email_status  text not null default 'pending'
                  check (email_status in ('pending', 'sent', 'failed')),
  email_error   text,
  created_at    timestamptz not null default now()
);

create index if not exists contact_messages_created_at_idx
  on public.contact_messages (created_at desc);
create index if not exists contact_messages_category_idx
  on public.contact_messages (category);
create index if not exists contact_messages_email_idx
  on public.contact_messages (lower(email));

alter table public.contact_messages enable row level security;
