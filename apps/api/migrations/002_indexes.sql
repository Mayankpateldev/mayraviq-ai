CREATE INDEX projects_workspace ON projects(workspace_id);
CREATE INDEX sessions_project ON sessions(project_id);
CREATE INDEX decisions_session ON decisions(session_id);
CREATE INDEX audit_workspace_time ON audit(workspace_id,at);
CREATE INDEX workspace_members_user ON workspace_members(user_id);
CREATE INDEX room_guests_user ON room_guests(user_id,expires_at);
CREATE INDEX conversations_workspace ON conversations(workspace_id);
