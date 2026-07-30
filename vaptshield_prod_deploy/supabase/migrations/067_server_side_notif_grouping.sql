-- ============================================================
-- VAPTShield Migration 067: Server-Side Notification Grouping
-- Resolves the RLS bypass issue where users couldn't group
-- notifications for other users.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_grouped_notification_v2(
    p_user_id UUID,
    p_org_id UUID,
    p_title TEXT,
    p_message TEXT,
    p_type TEXT,
    p_group_key TEXT DEFAULT NULL,
    p_link TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_existing_id UUID;
    v_count INTEGER;
BEGIN
    -- 1. If grouping is requested, look for existing unread notification
    -- We bypass RLS because this function is SECURITY DEFINER (owned by postgres)
    IF p_group_key IS NOT NULL THEN
        SELECT id, grouped_count INTO v_existing_id, v_count
        FROM public.notifications
        WHERE user_id = p_user_id 
          AND group_key = p_group_key 
          AND is_read = false
        LIMIT 1
        FOR UPDATE; -- Prevents race conditions from multiple messages

        IF v_existing_id IS NOT NULL THEN
            UPDATE public.notifications
            SET 
                grouped_count = v_count + 1,
                is_grouped = true,
                message = CASE 
                    WHEN p_message ILIKE '%message%' OR p_message ILIKE '%comment%' 
                    THEN 'You have ' || (v_count + 1) || ' new messages on this finding.'
                    ELSE p_title || ': ' || (v_count + 1) || ' updates pending.'
                END,
                created_at = NOW(),
                sound_played = false
            WHERE id = v_existing_id;
            RETURN;
        END IF;
    END IF;

    -- 2. Default: Insert new notification
    INSERT INTO public.notifications (
        user_id, org_id, title, message, type, group_key, link, is_grouped, grouped_count
    )
    VALUES (
        p_user_id, p_org_id, p_title, p_message, p_type, p_group_key, p_link, false, 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
