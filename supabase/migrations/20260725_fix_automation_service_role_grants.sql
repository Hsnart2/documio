-- Correzione permessi per automazione giornaliera e controllo manuale.
-- Idempotente: può essere eseguita anche se la migrazione principale è già stata applicata.

grant usage on schema public to authenticated, service_role;

grant select, insert, update
on table public.automation_preferences
to authenticated;

grant select, update
on table public.automation_activity
to authenticated;

grant select, update, delete
on table public.automation_notifications
to authenticated;

grant all privileges
on table public.automation_preferences,
         public.automation_activity,
         public.automation_notifications
to service_role;

grant execute on function public.documio_set_updated_at()
to authenticated, service_role;
