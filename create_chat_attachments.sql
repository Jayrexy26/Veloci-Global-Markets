-- Veloci Global Markets — chat file attachments (phase 2)
--
-- Private bucket: support conversations carry screenshots of balances, IDs and
-- similar, so files are readable only by the conversation owner and support,
-- through short-lived signed URLs.

-- ── message columns ──────────────────────────────────────────────────────────
alter table public.chat_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_type text,
  add column if not exists attachment_size integer;

-- A message may now carry an attachment instead of text, but never neither.
alter table public.chat_messages drop constraint if exists chat_messages_body_check;
alter table public.chat_messages add constraint chat_messages_body_check
  check (
    length(body) <= 4000
    and (btrim(body) <> '' or attachment_path is not null)
  );

-- Pin every file to the folder of its own conversation. Same-row check, so a
-- message can never point at a file belonging to a different thread.
alter table public.chat_messages drop constraint if exists chat_messages_attachment_path_check;
alter table public.chat_messages add constraint chat_messages_attachment_path_check
  check (
    attachment_path is null
    or attachment_path like conversation_id::text || '/%'
  );

alter table public.chat_messages drop constraint if exists chat_messages_attachment_size_check;
alter table public.chat_messages add constraint chat_messages_attachment_size_check
  check (attachment_size is null or (attachment_size > 0 and attachment_size <= 10485760));

-- ── bucket ───────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments', 'chat-attachments', false, 10485760,
  array['image/png','image/jpeg','image/jpg','image/gif','image/webp',
        'application/pdf','text/plain']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── storage policies ─────────────────────────────────────────────────────────
-- Files live at <conversation_id>/<filename>, so the first path segment decides
-- who may touch them.
drop policy if exists chat_attachments_insert on storage.objects;
create policy chat_attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and (
      exists (
        select 1 from public.chat_conversations c
        where c.id::text = (storage.foldername(name))[1]
          and c.user_id  = (select auth.uid())
      )
      or (select private.is_support_admin())
    )
  );

drop policy if exists chat_attachments_select on storage.objects;
create policy chat_attachments_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (
      exists (
        select 1 from public.chat_conversations c
        where c.id::text = (storage.foldername(name))[1]
          and c.user_id  = (select auth.uid())
      )
      or (select private.is_support_admin())
    )
  );

-- Only support may remove an attachment; users cannot delete evidence.
drop policy if exists chat_attachments_delete on storage.objects;
create policy chat_attachments_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (select private.is_support_admin())
  );
