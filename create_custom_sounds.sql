-- Custom notification sounds for the ops console.
-- Files go in the existing public-assets bucket, which already restricts
-- writes to admins; it just needs to accept audio as well as images.
update storage.buckets
   set allowed_mime_types = array[
         'image/jpeg','image/png','image/webp','image/gif','image/svg+xml',
         'audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/ogg',
         'audio/mp4','audio/aac','audio/webm'
       ]
 where id = 'public-assets';

-- Empty means "use the built-in tone".
insert into public.system_settings (key, value, updated_at) values
  ('sound_message_url', '', now()),
  ('sound_visitor_url', '', now())
on conflict (key) do nothing;
