-- Durable work with expiring leases: saved speech survives browser/API restarts.
CREATE TABLE meeting_recap_jobs (
 session_id text PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
 due_at bigint NOT NULL DEFAULT 0,
 lease_until bigint NOT NULL DEFAULT 0,
 lease_id text,
 attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX meeting_recap_jobs_due_idx ON meeting_recap_jobs(due_at,lease_until);
