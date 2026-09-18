update storage.buckets set allowed_mime_types=array['image/png','image/jpeg','image/webp']::text[], file_size_limit=2097152 where id='qr-branding';
