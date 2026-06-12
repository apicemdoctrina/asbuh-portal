-- Канонизация email: логин/поиск пользователя теперь нормализуют ввод
-- (trim + lowercase), поэтому существующие записи приводим к нижнему регистру.
-- Защита от коллизий: если lower(email) уже занят другим пользователем,
-- такую запись не трогаем (разрулить вручную).
UPDATE users u
SET email = lower(email)
WHERE email <> lower(email)
  AND NOT EXISTS (
    SELECT 1 FROM users u2
    WHERE u2.email = lower(u.email) AND u2.id <> u.id
  );
