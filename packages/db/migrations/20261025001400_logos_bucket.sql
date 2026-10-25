-- The public bucket for brand logos (P1.6). Public read; uploads only through our server with the service role
-- (nothing here lets a browser write to it). No SVG: it can carry scripts. 1 MiB, png/jpeg/webp.
--
-- Local development creates this bucket from supabase/config.toml, and on a brand-new local or CI database the storage
-- schema does not exist yet when migrations run, so this is skipped there. On a hosted project the storage schema exists,
-- so the bucket is created here and nobody has to click it into existence for each environment.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('logos', 'logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update
      set public = excluded.public,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
