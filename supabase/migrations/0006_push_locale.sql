-- Language chosen for daily nag copy. Existing rows stay English.

alter table public.push_subscriptions
  add column locale text not null default 'en'
  check (locale in ('en', 'zh-TW'));
