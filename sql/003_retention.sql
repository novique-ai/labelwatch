-- LabelWatch: 13-month retention for recalls + 90-day retention for poller_runs.
-- 13 months (not 12) gives Pro tier's 12-month visibility window a one-month
-- buffer so retention races never cut a customer's history short.
--
-- Run via Supabase pg_cron (extension available on all Supabase projects).
-- Scheduled daily at 03:17 UTC to avoid alignment with other infra jobs.

create extension if not exists pg_cron;

create or replace function public.purge_old_recalls()
returns void language plpgsql as $$
begin
  delete from public.recalls
   where recall_initiation_date < (current_date - interval '13 months');

  delete from public.poller_runs
   where started_at < (now() - interval '90 days');
end;
$$;

-- Schedule daily. Idempotent: re-running cron.schedule with the same job name
-- is not a no-op in all pg_cron versions, so we unschedule-if-exists first.
do $$
begin
  perform cron.unschedule('labelwatch-purge');
exception when others then
  null;  -- job didn't exist yet
end
$$;

select cron.schedule(
  'labelwatch-purge',
  '17 3 * * *',
  $$ select public.purge_old_recalls(); $$
);
