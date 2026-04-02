# Тикет-система для клиентов — Спецификация

**Дата**: 2026-03-13
**Статус**: Draft
**Контекст**: Блок 3 бизнес-модели — «строго асинхронно через тикеты». Заменяет хаос мессенджеров структурированной перепиской клиент ↔ бухгалтер.

---

## 1. Цель

Клиенты создают тикеты из карточки организации или со страницы `/tickets`. Бухгалтеры отвечают, ведут внутренние заметки, управляют статусами. Обе стороны получают уведомления (in-app SSE + Telegram).

**Сегменты клиентов:**

- Сегмент А (микробизнес): общение ТОЛЬКО через тикеты
- Сегмент Б (сложный бизнес): персональный менеджер + тикеты

---

## 2. Модель данных

### 2.1 Ticket

```prisma
model Ticket {
  id             String         @id @default(uuid())
  number         Int            @unique @default(autoincrement())
  subject        String
  type           TicketType     @default(QUESTION)
  status         TicketStatus   @default(NEW)
  priority       TicketPriority @default(NORMAL)

  organizationId String         @map("organization_id")
  organization   Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  createdById    String         @map("created_by_id")
  createdBy      User           @relation("TicketCreator", fields: [createdById], references: [id])

  assignedToId   String?        @map("assigned_to_id")
  assignedTo     User?          @relation("TicketAssignee", fields: [assignedToId], references: [id])

  closedAt       DateTime?      @map("closed_at")
  createdAt      DateTime       @default(now()) @map("created_at")
  updatedAt      DateTime       @updatedAt @map("updated_at")

  messages       TicketMessage[]

  @@index([organizationId, status])  // составной: частый фильтр «тикеты орг. по статусу»
  @@index([assignedToId])
  @@index([status])
  @@map("tickets")
}

enum TicketType {
  QUESTION
  DOCUMENT_REQUEST
  PROBLEM
  DOCUMENT_UPLOAD
}

enum TicketStatus {
  NEW
  IN_PROGRESS
  WAITING_CLIENT
  ON_HOLD
  ESCALATED
  CLOSED
  REOPENED
}

enum TicketPriority {
  LOW
  NORMAL
  HIGH
  URGENT
}
```

### 2.2 TicketMessage

```prisma
model TicketMessage {
  id         String    @id @default(uuid())
  body       String
  isInternal Boolean   @default(false) @map("is_internal")
  deletedAt  DateTime? @map("deleted_at")   // soft-delete: скрыто, но хранится в БД

  ticketId   String    @map("ticket_id")
  ticket     Ticket    @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  authorId   String    @map("author_id")
  author     User      @relation("TicketMessageAuthor", fields: [authorId], references: [id])

  createdAt  DateTime  @default(now()) @map("created_at")
  updatedAt  DateTime  @updatedAt @map("updated_at")

  attachments TicketAttachment[]

  @@index([ticketId])
  @@map("ticket_messages")
}
```

### 2.3 TicketAttachment

```prisma
model TicketAttachment {
  id        String   @id @default(uuid())
  fileName  String   @map("file_name")
  fileKey   String   @map("file_key")   // абстрактный ключ: для local = относительный путь, для S3 = object key
  fileSize  Int      @map("file_size")
  mimeType  String   @map("mime_type")

  messageId String   @map("message_id")
  message   TicketMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now()) @map("created_at")

  @@map("ticket_attachments")
}
```

### 2.4 Связи в существующих моделях

Добавить в `User`:

```prisma
createdTickets    Ticket[]          @relation("TicketCreator")
assignedTickets   Ticket[]          @relation("TicketAssignee")
ticketMessages    TicketMessage[]   @relation("TicketMessageAuthor")
```

Добавить в `Organization`:

```prisma
tickets Ticket[]
```

---

## 3. Права доступа (RBAC)

Новый entity `ticket` с actions: `view`, `create`, `edit`, `delete`.

| Роль       | view              | create | edit             | delete |
| ---------- | ----------------- | ------ | ---------------- | ------ |
| admin      | все тикеты        | да     | да (любой)       | да     |
| manager    | по своим участкам | да     | да (по участкам) | нет    |
| accountant | назначенные       | да     | свои             | нет    |
| client     | свои (по орг.)    | да     | нет              | нет    |

**Scoping** через `getScopedWhere()`:

- admin → `{}`
- manager → `{ organization: { section: { members: { some: { userId } } } } }`
- accountant → `{ organization: { section: { members: { some: { userId } } } } }` (все тикеты по участку, фильтр "Мои" через query param `assignedToId`)
- client → `{ organization: { members: { some: { userId, role: "client" } } } }`

**Row-level access**: GET `/api/tickets/:id` применяет тот же scoping — пользователь видит тикет только если он входит в его scope.

---

## 4. API (REST)

### 4.1 Tickets CRUD

| Метод  | Путь               | Доступ                                             | Описание                             |
| ------ | ------------------ | -------------------------------------------------- | ------------------------------------ |
| GET    | `/api/tickets`     | authenticate                                       | Список тикетов (с фильтрами, scoped) |
| GET    | `/api/tickets/:id` | authenticate                                       | Детали тикета с сообщениями (scoped) |
| POST   | `/api/tickets`     | authenticate, requirePermission("ticket","create") | Создать тикет                        |
| PATCH  | `/api/tickets/:id` | authenticate, requirePermission("ticket","edit")   | Обновить статус/приоритет/назначение |
| DELETE | `/api/tickets/:id` | authenticate, requireRole("admin")                 | Удалить тикет (только admin)         |

**Query-параметры GET /api/tickets:**

- `status` — фильтр по статусу (можно несколько через запятую)
- `type` — фильтр по типу
- `priority` — фильтр по приоритету
- `organizationId` — фильтр по организации
- `assignedToId` — фильтр по исполнителю
- `search` — поиск по subject
- `page`, `limit` — пагинация

**Body POST /api/tickets:**

```json
{
  "subject": "string",
  "type": "QUESTION",
  "organizationId": "uuid",
  "body": "string (первое сообщение)"
}
```

**Auto-assign логика** при создании (приоритет):

1. Найти `OrganizationMember` с ролью `"responsible"` для данной организации → назначить
2. Если `responsible` нет — найти `OrganizationMember` с ролью `"accountant"` → назначить первого
3. Если никого нет — оставить `assignedToId = null` (менеджер назначит вручную)

> Приоритет `responsible` > `accountant` исключает случайное назначение при наличии выделенного ответственного.

### 4.2 Messages + Attachments

| Метод  | Путь                                     | Доступ                                       | Описание                                 |
| ------ | ---------------------------------------- | -------------------------------------------- | ---------------------------------------- |
| POST   | `/api/tickets/:id/messages`              | authenticate                                 | Добавить сообщение (multipart/form-data) |
| GET    | `/api/tickets/attachments/:attachmentId` | authenticate (scoped)                        | Скачать файл                             |
| DELETE | `/api/tickets/:id/messages/:msgId`       | authenticate, requireRole("admin","manager") | Soft-delete сообщения                    |

**POST `/api/tickets/:id/messages`** — `multipart/form-data`:

- `body` (string, required) — текст сообщения
- `isInternal` (boolean, default false) — внутренняя заметка
- `files` (File[], optional) — вложения (до 5 файлов)

**Правила `isInternal`:**

- Если пользователь с ролью `client` отправляет `isInternal: true` → ответ 403
- GET `/api/tickets/:id` для клиентов фильтрует сообщения: `isInternal: false`

**Автоматическая смена статуса при отправке сообщения:**

- Клиент отправляет сообщение → если статус WAITING_CLIENT, меняется на IN_PROGRESS
- Сотрудник отправляет не-internal сообщение → статус автоматически меняется на WAITING_CLIENT (клиенту нужно ответить). Сотрудник может переопределить статус через PATCH.

**Обновление `Ticket.updatedAt`:** При создании сообщения или смене статуса — явно обновлять `updatedAt` через `prisma.ticket.update()`.

**Безопасность скачивания вложений:**
GET `/api/tickets/attachments/:attachmentId` проверяет цепочку: Attachment → Message → Ticket → getScopedWhere(). Клиент не может скачать файл из чужого тикета, даже зная UUID.

**Soft-delete сообщений:**
DELETE `/api/tickets/:id/messages/:msgId` (admin/manager) — ставит `deletedAt = now()`. Сообщение скрывается из ленты, но хранится в БД. Вложения НЕ удаляются с диска. В ленте вместо содержимого — «Сообщение удалено».

**Пагинация сообщений:**
GET `/api/tickets/:id` поддерживает cursor-based пагинацию для сообщений:

- `?cursor=<messageId>&limit=50` — следующая страница
- По умолчанию возвращает последние 50 сообщений (от новых к старым)
- Фронтенд подгружает старые сообщения при скролле вверх (infinite scroll)

**Хранение файлов:**

- MVP: локальное хранение через Multer в `uploads/tickets/{ticketId}/`
- Поле `fileKey` (не `filePath`) — абстрактный ключ, не зависит от физического расположения
- Готовность к миграции на S3-совместимое хранилище (MinIO, Yandex Object Storage): достаточно заменить storage-adapter, не меняя БД
- Макс. размер файла: 10 MB, до 5 файлов за сообщение
- Допустимые типы: pdf, doc, docx, xls, xlsx, jpg, jpeg, png, zip

---

## 5. Уведомления

| Событие                       | Кому                   | Канал          |
| ----------------------------- | ---------------------- | -------------- |
| Новый тикет                   | assignedTo (бухгалтер) | SSE + Telegram |
| Новое сообщение от клиента    | assignedTo             | SSE + Telegram |
| Новое сообщение от сотрудника | createdBy (клиент)     | SSE + Telegram |
| Смена статуса                 | createdBy (клиент)     | SSE            |
| Эскалация                     | менеджеры участка      | SSE + Telegram |

**link** в уведомлении: `/tickets/:id` — для навигации при клике.

**SSE reconnect:** Фронтенд при переподключении SSE (событие `onReconnect` / `onerror` → reconnect) делает GET `/api/tickets/:id` для актуализации данных. Это исключает потерю сообщений при обрыве мобильной сети или спящем режиме браузера.

---

## 6. Frontend

### 6.1 Навигация

Добавить в `Layout.jsx`:

```js
{ to: "/tickets", label: "Тикеты", icon: MessageSquare, permission: ["ticket", "view"] }
```

Для клиентов — показывать как "Обращения".

### 6.2 Страницы

**`/tickets`** — `TicketsPage.jsx`

- Список тикетов в виде таблицы/карточек
- Фильтры: статус, тип, приоритет, организация
- Кнопка "Создать обращение"
- Клиент видит: номер, тема, тип, статус, дата, последнее сообщение
- Сотрудник видит дополнительно: организация, назначен, приоритет

**`/tickets/:id`** — `TicketDetailPage.jsx`

- Лента сообщений (чат-стиль)
- Поле ввода + кнопка отправки + загрузка файлов
- Сотрудник: переключатель "Внутренняя заметка" (isInternal), сайдбар с управлением (статус, приоритет, назначение)
- Внутренние заметки — жёлтый фон, пунктирная рамка, невидимы клиенту
- Вложения — иконка файла + имя + размер, клик = скачивание

### 6.3 Интеграция в карточку организации

В `OrganizationDetailPage.jsx` добавить вкладку/секцию "Тикеты":

- Список тикетов по данной организации
- Кнопка "Создать тикет" (с предзаполненным organizationId)
- Ссылка на `/tickets/:id` для деталей

### 6.4 UI компоненты

- Статус-бейджи с цветами:
  - NEW: `bg-blue-100 text-blue-700`
  - IN_PROGRESS: `bg-yellow-100 text-yellow-700`
  - WAITING_CLIENT: `bg-orange-100 text-orange-700`
  - ON_HOLD: `bg-slate-100 text-slate-600`
  - ESCALATED: `bg-red-100 text-red-700`
  - CLOSED: `bg-green-100 text-green-700`
  - REOPENED: `bg-purple-100 text-purple-700`

- Приоритет-бейджи:
  - LOW: `bg-slate-100 text-slate-600`
  - NORMAL: `bg-blue-100 text-blue-700`
  - HIGH: `bg-orange-100 text-orange-700`
  - URGENT: `bg-red-100 text-red-700`

- Тип-бейджи:
  - QUESTION: `bg-blue-50 text-blue-600` + HelpCircle
  - DOCUMENT_REQUEST: `bg-amber-50 text-amber-600` + FileSearch
  - PROBLEM: `bg-red-50 text-red-600` + AlertTriangle
  - DOCUMENT_UPLOAD: `bg-green-50 text-green-600` + Upload

---

## 7. Валидация и аудит

**Валидация входных данных (Zod):**

- `subject`: string, 1–200 символов
- `body`: string, non-empty, max 5000 символов
- `organizationId`: uuid, должен существовать и быть доступен пользователю
- `type`: один из TicketType enum значений
- `priority`: один из TicketPriority enum значений
- `isInternal`: boolean (optional)

**Audit logging** (`logAudit()` вызывается для):

- `ticket.create` — создание тикета
- `ticket.update` — смена статуса/приоритета/назначения
- `ticket.delete` — удаление тикета
- `ticket.message.create` — отправка сообщения

**OrganizationMember.role** допустимые значения для auto-assign: `"responsible"`, `"accountant"`, `"client"`.

---

## 8. Seed данные

Добавить в seed:

- Permission records: `ticket` × `view`, `create`, `edit`, `delete`
- RolePermission привязки:
  - admin: все 4
  - manager: view, create, edit
  - accountant: view, create, edit
  - client: view, create

---

## 9. Файлы для создания/изменения

### Новые файлы:

- `apps/api/src/routes/tickets.ts`
- `apps/web/src/pages/TicketsPage.jsx`
- `apps/web/src/pages/TicketDetailPage.jsx`

### Изменяемые файлы:

- `apps/api/prisma/schema.prisma` — модели Ticket, TicketMessage, TicketAttachment + связи
- `apps/api/src/app.ts` — подключить ticketsRouter
- `apps/api/prisma/seed.ts` — permissions для ticket
- `apps/web/src/App.jsx` — роуты /tickets и /tickets/:id
- `apps/web/src/components/Layout.jsx` — пункт навигации
- `apps/web/src/pages/OrganizationDetailPage.jsx` — секция тикетов

### Миграция:

- `apps/api/prisma/migrations/<timestamp>_tickets/migration.sql`
- Для `number` autoincrement: `CREATE SEQUENCE tickets_number_seq; ALTER TABLE tickets ALTER COLUMN number SET DEFAULT nextval('tickets_number_seq');`
- Создать директорию `uploads/tickets/` (или убедиться что multer создаёт её автоматически)

---

## 10. Ограничения и будущие улучшения

**Не входит в текущую реализацию (YAGNI):**

- SLA и автоматические дедлайны
- Макросы и шаблоны ответов
- Оценка качества обслуживания (CSAT)
- Автоматическая эскалация по таймеру
- Массовые операции с тикетами
- Экспорт/отчёты по тикетам

**Возможно в будущем:**

- Канбан-доска тикетов для сотрудников
- Связь тикета с задачей (Task)
- Теги/метки на тикетах
- Полнотекстовый поиск по сообщениям
