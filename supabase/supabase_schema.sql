-- IdeaCanvas Supabase schema
-- Run this in the Supabase SQL editor for the target project.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS public.boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    title TEXT NOT NULL DEFAULT '새로운 생각',
    description TEXT,
    sort_order SERIAL
);

CREATE TABLE IF NOT EXISTS public.profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'teacher_pending' CHECK (role IN ('teacher_pending', 'teacher', 'teacher_rejected')),
    is_master BOOLEAN NOT NULL DEFAULT false,
    is_primary_master BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    board_id UUID REFERENCES public.boards(id) ON DELETE CASCADE,
    author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    title TEXT,
    content TEXT,
    bg_color TEXT DEFAULT 'bg-surface-container-lowest',
    author TEXT DEFAULT '익명',
    author_id TEXT NOT NULL,
    image_url TEXT,
    drawing_data TEXT,
    link_url TEXT,
    link_preview JSONB,
    section TEXT DEFAULT '새 섹션',
    client_ip TEXT
);

CREATE TABLE IF NOT EXISTS public.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    note_id UUID REFERENCES public.notes(id) ON DELETE CASCADE NOT NULL,
    author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    author TEXT DEFAULT '익명',
    author_id TEXT NOT NULL,
    content TEXT NOT NULL,
    client_ip TEXT
);

CREATE TABLE IF NOT EXISTS public.likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    note_id UUID REFERENCES public.notes(id) ON DELETE CASCADE NOT NULL,
    user_session_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    UNIQUE(note_id, user_session_id)
);

CREATE TABLE IF NOT EXISTS public.sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    board_id UUID REFERENCES public.boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order SERIAL
);

CREATE TABLE IF NOT EXISTS public.board_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    board_id UUID REFERENCES public.boards(id) ON DELETE CASCADE,
    settings_json JSONB DEFAULT '{}'::jsonb NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES public.boards(id) ON DELETE CASCADE;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS section TEXT DEFAULT '새 섹션';
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.likes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.sections ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES public.boards(id) ON DELETE CASCADE;
ALTER TABLE public.board_settings ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES public.boards(id) ON DELETE CASCADE;
ALTER TABLE public.board_settings ADD COLUMN IF NOT EXISTS write_enabled BOOLEAN;
ALTER TABLE public.board_settings ALTER COLUMN write_enabled SET DEFAULT true;
ALTER TABLE public.board_settings ADD COLUMN IF NOT EXISTS comments_enabled BOOLEAN;
ALTER TABLE public.board_settings ALTER COLUMN comments_enabled SET DEFAULT true;
ALTER TABLE public.board_settings ADD COLUMN IF NOT EXISTS likes_enabled BOOLEAN;
ALTER TABLE public.board_settings ALTER COLUMN likes_enabled SET DEFAULT true;
ALTER TABLE public.board_settings ADD COLUMN IF NOT EXISTS bg_color TEXT;
ALTER TABLE public.board_settings ALTER COLUMN bg_color SET DEFAULT 'default';
DELETE FROM public.likes
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY note_id, user_session_id
                   ORDER BY created_at ASC, id ASC
               ) AS duplicate_rank
        FROM public.likes
    ) ranked_likes
    WHERE duplicate_rank > 1
);
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'likes_note_id_user_session_id_key'
          AND conrelid = 'public.likes'::regclass
    ) THEN
        ALTER TABLE public.likes
        ADD CONSTRAINT likes_note_id_user_session_id_key UNIQUE (note_id, user_session_id);
    END IF;
END $$;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'board_settings'
          AND column_name = 'auth_write'
    ) THEN
        EXECUTE 'UPDATE public.board_settings
                 SET write_enabled = CASE
                     WHEN write_enabled IS NOT NULL THEN write_enabled
                     WHEN auth_write IS TRUE THEN false
                     ELSE true
                 END
                 WHERE write_enabled IS NULL';
    ELSE
        UPDATE public.board_settings
        SET write_enabled = true
        WHERE write_enabled IS NULL;
    END IF;
END $$;
ALTER TABLE public.board_settings ALTER COLUMN write_enabled SET NOT NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN ('teacher_pending', 'teacher', 'teacher_rejected'));

WITH default_board AS (
    INSERT INTO public.boards (title)
    SELECT '기본 보드'
    WHERE NOT EXISTS (SELECT 1 FROM public.boards)
    RETURNING id
),
resolved_default_board AS (
    SELECT id FROM default_board
    UNION ALL
    SELECT id FROM public.boards ORDER BY id LIMIT 1
)
UPDATE public.notes
SET board_id = (SELECT id FROM resolved_default_board LIMIT 1)
WHERE board_id IS NULL;

WITH resolved_default_board AS (
    SELECT id FROM public.boards ORDER BY id LIMIT 1
)
UPDATE public.sections
SET board_id = (SELECT id FROM resolved_default_board LIMIT 1)
WHERE board_id IS NULL;

WITH resolved_default_board AS (
    SELECT id FROM public.boards ORDER BY id LIMIT 1
)
UPDATE public.board_settings
SET board_id = (SELECT id FROM resolved_default_board LIMIT 1)
WHERE board_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS board_settings_board_id_unique
ON public.board_settings (board_id)
WHERE board_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles (role);
CREATE INDEX IF NOT EXISTS profiles_master_idx ON public.profiles (is_master);
CREATE INDEX IF NOT EXISTS notes_board_id_idx ON public.notes (board_id);
CREATE INDEX IF NOT EXISTS comments_note_id_idx ON public.comments (note_id);
CREATE INDEX IF NOT EXISTS sections_board_id_idx ON public.sections (board_id);

CREATE OR REPLACE FUNCTION private.current_profile_is_master()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE user_id = (SELECT auth.uid())
          AND is_master IS TRUE
    );
$$;

CREATE OR REPLACE FUNCTION private.profiles_exist()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (SELECT 1 FROM public.profiles);
$$;

CREATE OR REPLACE FUNCTION private.current_profile_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role
    FROM public.profiles
    WHERE user_id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION private.current_profile_is_rejected()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE user_id = (SELECT auth.uid())
          AND role = 'teacher_rejected'
    );
$$;

CREATE OR REPLACE FUNCTION private.current_profile_is_primary_master()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE user_id = (SELECT auth.uid())
          AND is_primary_master IS TRUE
    );
$$;

CREATE OR REPLACE FUNCTION private.current_profile_is_teacher_or_master()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE user_id = (SELECT auth.uid())
          AND (is_master IS TRUE OR role = 'teacher')
    );
$$;

CREATE OR REPLACE FUNCTION private.current_profile_can_write()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE user_id = (SELECT auth.uid())
          AND (is_master IS TRUE OR role IN ('teacher_pending', 'teacher'))
    );
$$;

CREATE OR REPLACE FUNCTION private.prevent_invalid_profile_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.is_primary_master IS TRUE AND NEW.is_master IS NOT TRUE THEN
        RAISE EXCEPTION 'Primary master cannot be demoted';
    END IF;

    IF OLD.is_master IS TRUE AND NEW.is_master IS NOT TRUE
       AND NOT EXISTS (
           SELECT 1
           FROM public.profiles
           WHERE user_id <> OLD.user_id
             AND is_master IS TRUE
       ) THEN
        RAISE EXCEPTION 'At least one master is required';
    END IF;

    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_invalid_update ON public.profiles;
CREATE TRIGGER profiles_prevent_invalid_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION private.prevent_invalid_profile_update();

CREATE OR REPLACE FUNCTION public.handle_profile_email_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    NEW.email := (SELECT email FROM auth.users WHERE id = NEW.user_id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_insert_sync_email ON public.profiles;
CREATE TRIGGER on_profile_insert_sync_email
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_profile_email_sync();

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, anon;
GRANT EXECUTE ON FUNCTION private.current_profile_is_master() TO authenticated;
GRANT EXECUTE ON FUNCTION private.profiles_exist() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_profile_role() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_profile_is_rejected() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_profile_is_primary_master() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_profile_is_teacher_or_master() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_profile_can_write() TO authenticated;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT ON public.notes, public.comments, public.likes TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Boards are readable" ON public.boards;
CREATE POLICY "Boards are readable"
ON public.boards FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Teachers can create boards" ON public.boards;
CREATE POLICY "Teachers can create boards"
ON public.boards FOR INSERT
TO authenticated
WITH CHECK ((SELECT private.current_profile_is_teacher_or_master()));

DROP POLICY IF EXISTS "Teachers can update boards" ON public.boards;
CREATE POLICY "Teachers can update boards"
ON public.boards FOR UPDATE
TO authenticated
USING ((SELECT private.current_profile_is_teacher_or_master()))
WITH CHECK ((SELECT private.current_profile_is_teacher_or_master()));

DROP POLICY IF EXISTS "Teachers can delete boards" ON public.boards;
CREATE POLICY "Teachers can delete boards"
ON public.boards FOR DELETE
TO authenticated
USING ((SELECT private.current_profile_is_teacher_or_master()));

DROP POLICY IF EXISTS "Profiles self and masters readable" ON public.profiles;
CREATE POLICY "Profiles self and masters readable"
ON public.profiles FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id OR (SELECT private.current_profile_is_master()));

DROP POLICY IF EXISTS "Users can create their profile" ON public.profiles;
CREATE POLICY "Users can create their profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (
        (
            NOT (SELECT private.profiles_exist())
            AND role = 'teacher'
            AND is_master IS TRUE
            AND is_primary_master IS TRUE
        )
        OR
        (
            (SELECT private.profiles_exist())
            AND role = 'teacher_pending'
            AND is_master IS FALSE
            AND is_primary_master IS FALSE
        )
    )
);

DROP POLICY IF EXISTS "Users update self name" ON public.profiles;
CREATE POLICY "Users update self name"
ON public.profiles FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND role = (SELECT private.current_profile_role())
    AND is_master = (SELECT private.current_profile_is_master())
    AND is_primary_master = (SELECT private.current_profile_is_primary_master())
);

DROP POLICY IF EXISTS "Masters manage profiles" ON public.profiles;
CREATE POLICY "Masters manage profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING ((SELECT private.current_profile_is_master()))
WITH CHECK ((SELECT private.current_profile_is_master()));

DROP POLICY IF EXISTS "Board settings readable" ON public.board_settings;
CREATE POLICY "Board settings readable"
ON public.board_settings FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Teachers manage board settings" ON public.board_settings;
CREATE POLICY "Teachers manage board settings"
ON public.board_settings FOR INSERT
TO authenticated
WITH CHECK ((SELECT private.current_profile_is_teacher_or_master()));

DROP POLICY IF EXISTS "Teachers update board settings" ON public.board_settings;
CREATE POLICY "Teachers update board settings"
ON public.board_settings FOR UPDATE
TO authenticated
USING ((SELECT private.current_profile_is_teacher_or_master()))
WITH CHECK ((SELECT private.current_profile_is_teacher_or_master()));

DROP POLICY IF EXISTS "Sections readable" ON public.sections;
CREATE POLICY "Sections readable"
ON public.sections FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Teachers manage sections" ON public.sections;
CREATE POLICY "Teachers manage sections"
ON public.sections FOR ALL
TO authenticated
USING ((SELECT private.current_profile_is_teacher_or_master()))
WITH CHECK ((SELECT private.current_profile_is_teacher_or_master()));

DROP POLICY IF EXISTS "Notes readable" ON public.notes;
CREATE POLICY "Notes readable"
ON public.notes FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Guests write when enabled" ON public.notes;
CREATE POLICY "Guests write when enabled"
ON public.notes FOR INSERT
TO anon
WITH CHECK (
    author IS NOT NULL
    AND length(trim(author)) > 0
    AND EXISTS (
        SELECT 1 FROM public.board_settings bs
        WHERE bs.board_id = notes.board_id
          AND COALESCE((bs.settings_json ->> 'write_enabled')::boolean, true)
    )
);

DROP POLICY IF EXISTS "Authenticated users write when allowed" ON public.notes;
CREATE POLICY "Authenticated users write when allowed"
ON public.notes FOR INSERT
TO authenticated
WITH CHECK (
    NOT (SELECT private.current_profile_is_rejected())
    AND (
        (
            (SELECT private.current_profile_can_write())
            AND author_user_id = (SELECT auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM public.board_settings bs
            WHERE bs.board_id = notes.board_id
              AND COALESCE((bs.settings_json ->> 'write_enabled')::boolean, true)
        )
    )
);

DROP POLICY IF EXISTS "Authors and teachers update notes" ON public.notes;
CREATE POLICY "Authors and teachers update notes"
ON public.notes FOR UPDATE
TO authenticated
USING (NOT (SELECT private.current_profile_is_rejected()) AND (author_user_id = (SELECT auth.uid()) OR (SELECT private.current_profile_is_teacher_or_master())))
WITH CHECK (NOT (SELECT private.current_profile_is_rejected()) AND (author_user_id = (SELECT auth.uid()) OR (SELECT private.current_profile_is_teacher_or_master())));

DROP POLICY IF EXISTS "Authors and teachers delete notes" ON public.notes;
CREATE POLICY "Authors and teachers delete notes"
ON public.notes FOR DELETE
TO authenticated
USING (NOT (SELECT private.current_profile_is_rejected()) AND (author_user_id = (SELECT auth.uid()) OR (SELECT private.current_profile_is_teacher_or_master())));

DROP POLICY IF EXISTS "Comments readable" ON public.comments;
CREATE POLICY "Comments readable"
ON public.comments FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Guests comment when enabled" ON public.comments;
CREATE POLICY "Guests comment when enabled"
ON public.comments FOR INSERT
TO anon
WITH CHECK (
    author IS NOT NULL
    AND length(trim(author)) > 0
    AND EXISTS (
        SELECT 1
        FROM public.notes n
        JOIN public.board_settings bs ON bs.board_id = n.board_id
        WHERE n.id = comments.note_id
          AND COALESCE((bs.settings_json ->> 'write_enabled')::boolean, true)
    )
);

DROP POLICY IF EXISTS "Authenticated users comment when allowed" ON public.comments;
CREATE POLICY "Authenticated users comment when allowed"
ON public.comments FOR INSERT
TO authenticated
WITH CHECK (
    NOT (SELECT private.current_profile_is_rejected())
    AND (
        (
            (SELECT private.current_profile_can_write())
            AND author_user_id = (SELECT auth.uid())
        )
        OR EXISTS (
            SELECT 1
            FROM public.notes n
            JOIN public.board_settings bs ON bs.board_id = n.board_id
            WHERE n.id = comments.note_id
              AND COALESCE((bs.settings_json ->> 'write_enabled')::boolean, true)
        )
    )
);

DROP POLICY IF EXISTS "Comment authors and teachers delete comments" ON public.comments;
CREATE POLICY "Comment authors and teachers delete comments"
ON public.comments FOR DELETE
TO authenticated
USING (NOT (SELECT private.current_profile_is_rejected()) AND (author_user_id = (SELECT auth.uid()) OR (SELECT private.current_profile_is_teacher_or_master())));

DROP POLICY IF EXISTS "Guests can delete comments" ON public.comments;
CREATE POLICY "Guests can delete comments"
ON public.comments FOR DELETE
TO anon
USING (true);

DROP POLICY IF EXISTS "Likes readable" ON public.likes;
CREATE POLICY "Likes readable"
ON public.likes FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Guests can like" ON public.likes;
CREATE POLICY "Guests can like"
ON public.likes FOR INSERT
TO anon
WITH CHECK (true);

DROP POLICY IF EXISTS "Non-rejected users can like" ON public.likes;
CREATE POLICY "Non-rejected users can like"
ON public.likes FOR INSERT
TO authenticated
WITH CHECK (NOT (SELECT private.current_profile_is_rejected()));

DROP POLICY IF EXISTS "Guests can remove likes" ON public.likes;
CREATE POLICY "Guests can remove likes"
ON public.likes FOR DELETE
TO anon
USING (true);

DROP POLICY IF EXISTS "Non-rejected users can remove likes" ON public.likes;
CREATE POLICY "Non-rejected users can remove likes"
ON public.likes FOR DELETE
TO authenticated
USING (NOT (SELECT private.current_profile_is_rejected()));

BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE public.boards, public.notes, public.comments, public.likes, public.sections, public.board_settings, public.profiles;
COMMIT;

NOTIFY pgrst, 'reload schema';

ALTER TABLE public.board_settings ADD COLUMN IF NOT EXISTS settings_json JSONB DEFAULT '{}'::jsonb NOT NULL;

-- 기존 컬럼들의 데이터를 settings_json에 마이그레이션
UPDATE public.board_settings
SET settings_json = jsonb_build_object(
    'write_enabled', COALESCE(write_enabled, true),
    'comments_enabled', COALESCE(comments_enabled, true),
    'likes_enabled', COALESCE(likes_enabled, true),
    'bg_color', COALESCE(bg_color, 'default'),
    'sections_enabled', false
)
WHERE settings_json = '{}'::jsonb;

ALTER TABLE public.board_settings
    DROP COLUMN IF EXISTS title,
    DROP COLUMN IF EXISTS write_enabled,
    DROP COLUMN IF EXISTS comments_enabled,
    DROP COLUMN IF EXISTS likes_enabled,
    DROP COLUMN IF EXISTS bg_color;

NOTIFY pgrst, 'reload schema';
