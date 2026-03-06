ALTER TABLE organization_documents
  ADD COLUMN version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN group_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN is_latest BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX idx_org_documents_group_id ON organization_documents(group_id);
