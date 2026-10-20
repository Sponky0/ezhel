-- ============================================================================
-- 0023_block_rls_filters.sql
-- Engelleme (Block) durumlarının RLS seviyesinde otomatik filtrelenmesi
-- ============================================================================

-- 1. PROFILES SELECT Politikasının Güncellenmesi
-- Engellenen veya engelleyen profillerin listelenmesini engelle.
DROP POLICY IF EXISTS "Profilleri herkes görüntüleyebilir" ON public.profiles;
CREATE POLICY "Profilleri herkes görüntüleyebilir" ON public.profiles
  FOR SELECT USING (
    public.is_license_valid()
    AND (
      auth.uid() IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.blocks
        WHERE (blocker_id = auth.uid() AND blocked_id = profiles.id)
           OR (blocker_id = profiles.id AND blocked_id = auth.uid())
      )
    )
  );

-- 2. CONVERSATION_PARTICIPANTS SELECT Politikasının Güncellenmesi
-- Engelleme durumu olan konuşma katılımcılarını filtrele.
DROP POLICY IF EXISTS "conversation_participants_select" ON public.conversation_participants;
CREATE POLICY "conversation_participants_select" ON public.conversation_participants
  FOR SELECT USING (
    (
      auth.uid() = user_id
      OR (
        public.is_conversation_participant(conversation_id)
        AND NOT EXISTS (
          SELECT 1 FROM public.blocks
          WHERE (blocker_id = auth.uid() AND blocked_id = user_id)
             OR (blocker_id = user_id AND blocked_id = auth.uid())
        )
      )
      OR public.is_admin()
    )
    AND public.is_license_valid()
  );

-- 3. MESSAGES SELECT Politikasının Güncellenmesi
-- Engellenen kişilerden gelen veya engellenen kişilere gönderilen mesajların okunmasını engelle.
DROP POLICY IF EXISTS "Mesajları sadece sohbet katılımcıları ve adminler görebilir" ON public.messages;
CREATE POLICY "Mesajları sadece sohbet katılımcıları ve adminler görebilir" ON public.messages
  FOR SELECT USING (
    (
      (
        EXISTS (
          SELECT 1 FROM public.conversation_participants
          WHERE conversation_participants.conversation_id = messages.conversation_id
          AND conversation_participants.user_id = auth.uid()
        )
        AND deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.blocks
          WHERE (blocker_id = auth.uid() AND blocked_id = sender_id)
             OR (blocker_id = sender_id AND blocked_id = auth.uid())
        )
      )
      OR public.is_admin()
    )
    AND public.is_license_valid()
  );

-- 4. MESSAGES INSERT Politikasının Güncellenmesi
-- Engelleme durumu varsa konuşmaya yeni mesaj yazılmasını engelle.
DROP POLICY IF EXISTS "Katılımcılar konuşmaya mesaj yazabilir" ON public.messages;
CREATE POLICY "Katılımcılar konuşmaya mesaj yazabilir" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_participants.conversation_id = messages.conversation_id
      AND conversation_participants.user_id = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      JOIN public.blocks b ON 
        (b.blocker_id = cp.user_id AND b.blocked_id = auth.uid()) OR
        (b.blocker_id = auth.uid() AND b.blocked_id = cp.user_id)
      WHERE cp.conversation_id = messages.conversation_id
    )
    AND public.is_license_valid()
  );

-- 5. STORIES SELECT Politikasının Güncellenmesi
-- Engellenen veya engelleyen kullanıcıların storylerini görmesini engelle.
DROP POLICY IF EXISTS "Aktif veya öne çıkarılmış storyleri herkes görebilir" ON public.stories;
CREATE POLICY "Aktif veya öne çıkarılmış storyleri herkes görebilir" ON public.stories
  FOR SELECT USING (
    (expires_at > now() OR is_highlight = true)
    AND public.is_license_valid()
    AND (
      auth.uid() IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.blocks
        WHERE (blocker_id = auth.uid() AND blocked_id = user_id)
           OR (blocker_id = user_id AND blocked_id = auth.uid())
      )
    )
  );
