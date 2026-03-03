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

Nginx должен проксировать `/api` и `/uploads` к API, а также корректно обслуживать
SSE-стрим уведомлений (`/api/notifications/stream`) — буферизация должна быть отключена.

Пример конфига (`/etc/nginx/sites-available/app.asbuh.com`):

```nginx
server {
    listen 80;
    server_name app.asbuh.com;

    root /opt/asbuh-portal/apps/web/dist;
    index index.html;

    # SSE-стрим уведомлений — буферизацию отключить обязательно
    location /api/notifications/stream {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        chunked_transfer_encoding on;
    }

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
# База данных
DATABASE_URL=postgresql://postgres:pass@localhost:5432/asbuh_portal

# Auth
JWT_SECRET=<случайная строка, openssl rand -hex 32>
REFRESH_TOKEN_SECRET=<случайная строка, openssl rand -hex 32>
ENCRYPTION_KEY=<64 hex символа, openssl rand -hex 32>

# Сервер
PORT=3001
ALLOWED_ORIGINS=https://app.asbuh.com
APP_URL=https://app.asbuh.com

# SMTP (для сброса пароля; если не задан — ссылки пишутся в лог)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@asbuh.com
SMTP_PASS=<пароль>
SMTP_FROM=ASBUH <noreply@asbuh.com>

# Telegram бот (опционально; уведомления отключены если не задан)
TELEGRAM_BOT_TOKEN=<токен от @BotFather>
# Прокси для Telegram API, если Telegram заблокирован в сети сервера:
# HTTPS_PROXY=http://user:pass@proxy-host:3128
```
