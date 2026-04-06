ALTER TABLE "sections" ADD COLUMN "animal" VARCHAR(50);
ALTER TABLE "sections" ADD CONSTRAINT "sections_animal_key" UNIQUE ("animal");
