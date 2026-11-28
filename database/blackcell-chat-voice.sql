-- Extend the existing participant-scoped private chat attachments to audio.
-- Existing RLS, batch ownership and security policies remain unchanged.
alter table public.corp_chat_media_items
 drop constraint corp_chat_media_items_kind_check,
 drop constraint corp_chat_media_kind_match,
 drop constraint corp_chat_media_file_path_valid;
alter table public.corp_chat_media_items
 add constraint corp_chat_media_items_kind_check check(kind in ('photo','video','audio')),
 add constraint corp_chat_media_kind_match check(
 (kind='photo' and mime_type in ('image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','image/heic-sequence','image/heif-sequence','image/avif'))
 or (kind='video' and mime_type in ('video/mp4','video/webm','video/quicktime','video/x-m4v'))
 or (kind='audio' and mime_type in ('audio/webm','audio/mp4','audio/ogg') and bytes<=10485760)),
 add constraint corp_chat_media_file_path_valid check(storage_path='blackcell-private-chat/v1/'||sender_id::text||'/'||recipient_id::text||'/'||batch_id::text||'/'||id::text||'.'||case mime_type
 when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/gif' then 'gif'
 when 'image/heic' then 'heic' when 'image/heif' then 'heif' when 'image/heic-sequence' then 'heics' when 'image/heif-sequence' then 'heifs' when 'image/avif' then 'avif'
 when 'video/mp4' then 'mp4' when 'video/webm' then 'webm' when 'video/quicktime' then 'mov' when 'video/x-m4v' then 'm4v'
 when 'audio/webm' then 'webm' when 'audio/mp4' then 'm4a' when 'audio/ogg' then 'ogg' end);
