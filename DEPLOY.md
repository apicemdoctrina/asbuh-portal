# Деплой на продакшн (app.asbuh.com)

## Архитектура сервера

| Компонент  | Способ запуска                     | Путь                               |
| ---------- | ---------------------------------- | ---------------------------------- |
| PostgreSQL | Docker (`docker-compose.prod.yml`) | `/opt/asbuh-portal/`               |
| API        | systemd `asbuh-api.service`        | `/opt/asbuh-portal/apps/api/`      |
| Frontend   | nginx → static files               | `/opt/asbuh-portal/apps/web/dist/` |

## Стандартный деплой

```bash
# 1. Перейти в папку проекта
cd /opt/asbuh-portal

# 2. Подтянуть изменения (если есть uncommitted изменения на сервере)
git checkout -- package-lock.json
git pull origin main

# 3. Установить зависимости (если добавились новые пакеты)
npm install

# 4. Применить миграции БД (если были изменения схемы)
npm run db:migrate -w apps/api

# 5. Пересобрать фронтенд
npm run build -w apps/web

# 6. Перезапустить API
sudo systemctl restart asbuh-api
sudo systemctl status asbuh-api
```

Nginx подхватывает новую сборку автоматически — перезапуск не нужен.

## Если добавились новые permissions/роли

После миграций заново запусти сид (безопасно — upsert, данные не затрёт):

```bash
npm run db:seed -w apps/api
```

Затем попроси пользователей перелогиниться.

## Частые проблемы

### API не стартует: `ENCRYPTION_KEY must be exactly 64 hex characters`

В `.env` не хватает переменной. Сгенерировать и добавить:

```bash
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> /opt/asbuh-portal/apps/api/.env
sudo systemctl restart asbuh-api
```

### `port is already allocated` при запуске Docker

Не запускать `docker compose up` без флага `-f` — использовать только prod-файл:

```bash
docker compose -f docker-compose.prod.yml up -d
```

### Фронтенд обновился, но в браузере старая версия

Жёсткая перезагрузка: `Ctrl+Shift+R`

### `Your local changes would be overwritten by merge`

```bash
git checkout -- package-lock.json
git pull origin main
```

## Проверка после деплоя

```bash
# Статус API
sudo systemctl status asbuh-api

# Логи API (последние 50 строк)
journalctl -u asbuh-api -n 50 --no-pager

# Статус БД
docker compose -f docker-compose.prod.yml ps
```

## Конфигурация nginx

Nginx должен проксировать как `/api`, так и `/uploads` к API-сервису.
Без блока `/uploads` аватарки и загруженные файлы (документы, обложки базы знаний) не будут отображаться.

Пример конфига (`/etc/nginx/sites-available/app.asbuh.com`):

```nginx
server {
    listen 80;
    server_name app.asbuh.com;

    root /opt/asbuh-portal/apps/web/dist;
    index index.html;

    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /uploads {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

После изменения конфига:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Переменные окружения API (`apps/api/.env`)

При первой настройке сервера убедись что все переменные заданы:

```
DATABASE_URL=postgresql://...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
ENCRYPTION_KEY=<64 hex символа, openssl rand -hex 32>
ALLOWED_ORIGINS=https://app.asbuh.com
```
