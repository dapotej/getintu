-- Pin the trigger function's search path so it can't be redirected by a caller's settings.
ALTER FUNCTION public.audit_log_reject_change() SET search_path = '';
