-- RBAC Pack A: admin singleton trigger + remove audit_log:view from manager

-- 1. Admin singleton: DB-level trigger that raises if a second admin is inserted/updated
CREATE OR REPLACE FUNCTION enforce_admin_singleton() RETURNS trigger AS $$
DECLARE
  new_role_name TEXT;
  other_admin_count INT;
BEGIN
  SELECT name INTO new_role_name FROM roles WHERE id = NEW.role_id;
  IF new_role_name = 'admin' THEN
    SELECT COUNT(*) INTO other_admin_count
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE r.name = 'admin' AND ur.user_id <> NEW.user_id;
    IF other_admin_count >= 1 THEN
      RAISE EXCEPTION 'Only one admin is allowed' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_singleton_trigger ON user_roles;
CREATE TRIGGER admin_singleton_trigger
  BEFORE INSERT OR UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION enforce_admin_singleton();

-- 2. Remove audit_log:view permission from manager role
DELETE FROM role_permissions
  WHERE role_id = (SELECT id FROM roles WHERE name = 'manager')
    AND permission_id = (SELECT id FROM permissions WHERE entity = 'audit_log' AND action = 'view');
