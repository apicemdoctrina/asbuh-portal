-- Add indexes for frequently filtered foreign-key columns

-- Organization.sectionId — used in getScopedWhere for every org query
CREATE INDEX IF NOT EXISTS "organizations_section_id_idx" ON "organizations"("section_id");

-- OrganizationMember.organizationId — loading members of an org
-- (userId is leading column in the unique index, so organizationId needs its own)
CREATE INDEX IF NOT EXISTS "organization_members_organization_id_idx" ON "organization_members"("organization_id");

-- SectionMember.userId — looking up sections by user
-- (sectionId is leading column in the unique index)
CREATE INDEX IF NOT EXISTS "section_members_user_id_idx" ON "section_members"("user_id");

-- RefreshToken.userId — deleteMany on logout / password change
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");
