-- Run in Supabase SQL Editor (or psql) against your project database.
-- Ensures deleting auth.users(id) removes all public rows tied to that user.
--
-- Also updates category_id / source_id FKs so deleting a category or source
-- removes dependent rows (matches app behavior on category delete).

-- ---------------------------------------------------------------------------
-- auth.users: ON DELETE CASCADE for every user_id FK
-- ---------------------------------------------------------------------------

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_user_id_fkey;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.sources
  DROP CONSTRAINT IF EXISTS sources_user_id_fkey;

ALTER TABLE public.sources
  ADD CONSTRAINT sources_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.news_articles
  DROP CONSTRAINT IF EXISTS news_articles_user_id_fkey;

ALTER TABLE public.news_articles
  ADD CONSTRAINT news_articles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

ALTER TABLE public.news_article_exclusions
  DROP CONSTRAINT IF EXISTS news_article_exclusions_user_id_fkey;

ALTER TABLE public.news_article_exclusions
  ADD CONSTRAINT news_article_exclusions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- categories / sources: cascade when parent row is deleted (not only user)
-- ---------------------------------------------------------------------------

ALTER TABLE public.sources
  DROP CONSTRAINT IF EXISTS sources_category_id_fkey;

ALTER TABLE public.sources
  ADD CONSTRAINT sources_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES public.categories (id) ON DELETE CASCADE;

ALTER TABLE public.news_articles
  DROP CONSTRAINT IF EXISTS news_articles_category_id_fkey;

ALTER TABLE public.news_articles
  ADD CONSTRAINT news_articles_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES public.categories (id) ON DELETE CASCADE;

ALTER TABLE public.news_article_exclusions
  DROP CONSTRAINT IF EXISTS news_article_exclusions_category_id_fkey;

ALTER TABLE public.news_article_exclusions
  ADD CONSTRAINT news_article_exclusions_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES public.categories (id) ON DELETE CASCADE;

ALTER TABLE public.news_article_exclusions
  DROP CONSTRAINT IF EXISTS news_article_exclusions_source_id_fkey;

ALTER TABLE public.news_article_exclusions
  ADD CONSTRAINT news_article_exclusions_source_id_fkey
  FOREIGN KEY (source_id) REFERENCES public.sources (id) ON DELETE CASCADE;
