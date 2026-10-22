ALTER TABLE workspaces ADD CONSTRAINT workspace_capture_flags CHECK(recording IN (0,1) AND transcription IN (0,1));
ALTER TABLE projects ADD CONSTRAINT project_status CHECK(status IN ('active','archived'));
ALTER TABLE sessions ADD CONSTRAINT session_status CHECK(status IN ('scheduled','active','ended'));
ALTER TABLE sessions ADD CONSTRAINT session_version CHECK(version >= 0);
ALTER TABLE decisions ADD CONSTRAINT decision_status CHECK(status IN ('draft','accepted','rejected'));
ALTER TABLE decisions ADD CONSTRAINT decision_version CHECK(version >= 0);
ALTER TABLE canvases ADD CONSTRAINT canvas_contents CHECK(version >= 0 AND jsonb_typeof(nodes::jsonb)='array' AND jsonb_typeof(edges::jsonb)='array');
ALTER TABLE room_canvases ADD CONSTRAINT room_canvas_contents CHECK(version >= 0 AND jsonb_typeof(nodes::jsonb)='array' AND jsonb_typeof(edges::jsonb)='array');
ALTER TABLE request_limits ADD CONSTRAINT request_limit_hits CHECK(hits > 0);
