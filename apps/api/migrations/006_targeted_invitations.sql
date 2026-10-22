CREATE TABLE room_invite_recipients (
 invite_id text PRIMARY KEY REFERENCES room_invites(id) ON DELETE CASCADE,
 recipient_user_id text,
 recipient_email text,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','declined')),
 delivery text NOT NULL DEFAULT 'in_app' CHECK(delivery IN ('in_app','preview','sending','accepted_by_smtp','failed')),
 mail_ciphertext text,
 responded_at text,
 CHECK(recipient_user_id IS NOT NULL OR recipient_email IS NOT NULL)
);
CREATE INDEX room_invite_recipient_user_idx ON room_invite_recipients(recipient_user_id,state);
CREATE INDEX room_invite_recipient_email_idx ON room_invite_recipients(recipient_email,state);
