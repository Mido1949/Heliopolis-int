-- Add client_type column to leads table
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS client_type TEXT
    CHECK (client_type IN ('موزع', 'شركة تكييف', 'مقاول', 'عميل منفرد'));
