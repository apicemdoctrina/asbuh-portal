ALTER TABLE organization_documents
  ADD COLUMN document_date DATE,
  ADD COLUMN period_month SMALLINT,
  ADD COLUMN period_year SMALLINT;
