-- Language chosen for daily nag copy. Existing rows stay English.
-- Apply this migration at deploy, before or with the app that reads
-- push_subscriptions.locale. Until it is applied, push writes fall back
-- to the old columns and nag in English.

alter table public.push_subscriptions
  add column locale text not null default 'en'
  check (locale in ('en', 'zh-TW'));
