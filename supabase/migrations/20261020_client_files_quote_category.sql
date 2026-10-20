-- 2026-10-20 — quote PDFs uploaded on a lead (lib/lead-files.ts) are saved
-- with category 'quote', which the check constraint did not allow, so every
-- upload was rejected and rolled back. Applied to production on 2026-10-20.
alter table public.client_files drop constraint client_files_category_check;
alter table public.client_files add constraint client_files_category_check
  check (category = any (array['catalog','pricelist','brand','content','certificate','course','product','other','quote']));
