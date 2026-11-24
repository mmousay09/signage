-- الأعمدة الجديدة تحتاج صلاحية تعديل صريحة، لأن الجدولين محميان بالأعمدة
grant update (rotation, volume, alert_offline) on public.screens to authenticated;
grant update (screen_pin_hash) on public.organizations to authenticated;
