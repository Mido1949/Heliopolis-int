-- The new-lead form (app/(dashboard)/crm/LeadFormModal.tsx) has always had a
-- "السعة المطلوبة (Capacity)" field, and types/index.ts declares
-- Lead.project_capacity — but the column was never created. Any lead saved
-- with that field filled in was rejected by PostgREST with
-- "Could not find the 'project_capacity' column of 'leads' in the schema
-- cache" (PGRST204), which the form swallowed into a generic save error.

alter table leads add column if not exists project_capacity text;
