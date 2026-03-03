-- CreateTable
CREATE TABLE "telegram_bindings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "chat_id" TEXT,
    "username" TEXT,
    "code" TEXT,
    "code_expires_at" TIMESTAMP(3),
    "connected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_bindings_user_id_key" ON "telegram_bindings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_bindings_chat_id_key" ON "telegram_bindings"("chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_bindings_code_key" ON "telegram_bindings"("code");

-- AddForeignKey
ALTER TABLE "telegram_bindings" ADD CONSTRAINT "telegram_bindings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
