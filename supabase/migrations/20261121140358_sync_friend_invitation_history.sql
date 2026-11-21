-- Keep session membership and the profile history row in the same acceptance transaction.
CREATE OR REPLACE FUNCTION public.accept_invitation(invitation_id uuid)
RETURNS TABLE(success boolean, message text, session_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  viewer uuid := auth.uid();
  invite public.invitations%ROWTYPE;
  session_row public.debate_sessions%ROWTYPE;
  debate_row public.debates%ROWTYPE;
BEGIN
  IF viewer IS NULL THEN
    RETURN QUERY SELECT false, 'Sign in required'::text, NULL::uuid;
    RETURN;
  END IF;
  SELECT * INTO invite FROM public.invitations i
    WHERE i.id = invitation_id AND i.receiver_id = viewer FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Invitation unavailable'::text, NULL::uuid;
    RETURN;
  END IF;
  IF invite.status IS DISTINCT FROM 'accepted' AND
      (invite.status IS DISTINCT FROM 'pending' OR invite.expires_at IS NULL OR invite.expires_at <= now()) THEN
    RETURN QUERY SELECT false, 'Invitation not found or expired'::text, NULL::uuid;
    RETURN;
  END IF;
  SELECT * INTO session_row FROM public.debate_sessions s WHERE s.id = invite.debate_session_id FOR UPDATE;
  IF NOT FOUND OR session_row.user_a IS DISTINCT FROM invite.sender_id OR viewer = session_row.user_a THEN
    RETURN QUERY SELECT false, 'Session unavailable'::text, NULL::uuid;
    RETURN;
  END IF;
  SELECT * INTO debate_row FROM public.debates d WHERE d.id = session_row.debate_id FOR UPDATE;
  IF NOT FOUND OR debate_row.participant_a IS DISTINCT FROM session_row.user_a OR
      (debate_row.participant_b IS NOT NULL AND debate_row.participant_b <> viewer) OR
      EXISTS (SELECT 1 FROM public.debate_sessions s WHERE s.debate_id = debate_row.id AND s.id <> session_row.id) THEN
    RETURN QUERY SELECT false, 'Debate unavailable'::text, NULL::uuid;
    RETURN;
  END IF;
  IF invite.status = 'accepted' THEN
    IF session_row.user_b = viewer AND debate_row.participant_b = viewer THEN
      RETURN QUERY SELECT true, 'Invitation already accepted'::text, session_row.id;
    ELSE
      RETURN QUERY SELECT false, 'Session unavailable'::text, NULL::uuid;
    END IF;
    RETURN;
  END IF;
  IF session_row.user_b IS NOT NULL OR coalesce(debate_row.status, '') NOT IN ('waiting', 'active') OR debate_row.ended_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'Session no longer available'::text, NULL::uuid;
    RETURN;
  END IF;
  UPDATE public.invitations SET status = 'accepted', updated_at = now() WHERE id = invite.id;
  UPDATE public.debate_sessions SET user_b = viewer, current_phase = 'topic_selection', updated_at = now() WHERE id = session_row.id;
  UPDATE public.debates SET participant_b = viewer, status = 'active', started_at = coalesce(started_at, now()), updated_at = now() WHERE id = debate_row.id;
  RETURN QUERY SELECT true, 'Invitation accepted successfully'::text, session_row.id;
END;
$function$;

-- Restore only unambiguous links attested by a matching accepted invitation.
WITH confirmed AS (
  SELECT s.debate_id, s.user_a, s.user_b, min(i.updated_at) AS accepted_at
  FROM public.debate_sessions s
  JOIN public.invitations i ON i.debate_session_id = s.id AND i.sender_id = s.user_a AND i.receiver_id = s.user_b AND i.status = 'accepted'
  WHERE s.user_b IS NOT NULL AND s.user_b <> s.user_a
    AND NOT EXISTS (SELECT 1 FROM public.debate_sessions other WHERE other.debate_id = s.debate_id AND other.id <> s.id)
  GROUP BY s.debate_id, s.user_a, s.user_b
)
UPDATE public.debates d
SET participant_b = c.user_b,
    status = CASE WHEN d.status = 'waiting' AND d.ended_at IS NULL THEN 'active' ELSE d.status END,
    started_at = CASE WHEN d.status = 'waiting' AND d.ended_at IS NULL THEN coalesce(d.started_at,c.accepted_at) ELSE d.started_at END,
    updated_at = now()
FROM confirmed c
WHERE d.id = c.debate_id AND d.participant_a = c.user_a AND d.participant_b IS NULL;
