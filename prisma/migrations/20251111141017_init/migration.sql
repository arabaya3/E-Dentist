-- CreateTable
CREATE TABLE "clinic_content" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_content_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinic_content_slug_locale_idx" ON "clinic_content"("slug", "locale");
