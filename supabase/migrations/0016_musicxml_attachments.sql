-- Allow MusicXML (.musicxml, .mxl, .xml) attachments on notes, licks and resources. Safe to run more than once.

alter table public.attachments drop constraint if exists attachments_kind_check;
alter table public.attachments add constraint attachments_kind_check
  check (kind in ('pdf', 'image', 'audio', 'musicxml'));
