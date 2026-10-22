-- Preserve legacy grants until their existing expiry; new grants track their source invitation.
ALTER TABLE room_guests ADD COLUMN invite_id text REFERENCES room_invites(id);
CREATE INDEX room_guests_invite_id_idx ON room_guests(invite_id);
