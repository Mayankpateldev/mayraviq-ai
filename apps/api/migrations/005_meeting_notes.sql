CREATE TABLE meeting_transcripts (
 id text PRIMARY KEY,
 session_id text NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 user_id text NOT NULL,
 speaker text NOT NULL,
 body text NOT NULL CHECK(length(body)<=4000),
 captured_at text NOT NULL,
 created_at text NOT NULL
);
CREATE INDEX meeting_transcripts_room_idx ON meeting_transcripts(session_id,created_at,id);
CREATE TABLE meeting_recaps (
 session_id text PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
 draft text NOT NULL,
 source_count integer NOT NULL,
 generated_at text NOT NULL
);
