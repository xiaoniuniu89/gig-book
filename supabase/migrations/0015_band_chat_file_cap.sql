-- A band's group chat link (WhatsApp etc.), shown to members only, and a 20 MB cap per uploaded file. Safe to run more than once.

-- Members read it through bands_select; only admins change it (bands_update). Not part of the public press kit.
alter table public.bands add column if not exists chat_url text;
do $$ begin
  alter table public.bands add constraint bands_chat_url_fmt check (chat_url is null or (chat_url ~ '^https://' and char_length(chat_url) <= 500));
exception when duplicate_object then null; end $$;
grant update (chat_url) on public.bands to authenticated;

-- Enforced by Storage itself, whatever the app sends.
update storage.buckets set file_size_limit = 20 * 1024 * 1024 where id = 'attachments';
