export type Project = {
  id: string;
  title: string;
  description: string;
  color: string;
  status: string;
  created_at: string;
};
export type Session = {
  id: string;
  project_id: string;
  title: string;
  scheduled_at: string;
  status: string;
  notes: string;
  summary: string;
  version: number;
};
export type Decision = {
  id: string;
  session_id: string;
  title: string;
  owner: string;
  due_at: string | null;
  status: string;
  version: number;
  created_at: string;
};
export type CanvasNode = {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  kind?:
    | "note"
    | "task"
    | "text"
    | "rectangle"
    | "ellipse"
    | "diamond"
    | "frame"
    | "line"
    | "arrow"
    | "freehand";
  points?: [number, number][];
  name?: string;
  frameId?: string;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  textColor?: string;
  fontSize?: number;
  fontFamily?: "sans" | "serif" | "monospace";
  fontWeight?: number;
  textAlign?: "left" | "center" | "right";
  locked?: boolean;
  hidden?: boolean;
  done?: boolean;
};
export type WorkspaceData = {
  user: { displayName: string; email: string };
  workspace: null | {
    id: string;
    name: string;
    recording: number;
    transcription: number;
    role?: string;
  };
  projects: Project[];
  sessions: Session[];
  decisions: Decision[];
  audit: {
    id: string;
    actor: string;
    action: string;
    artifact_id: string;
    at: string;
  }[];
  canvases: {
    project_id: string;
    nodes: string;
    edges: string;
    version: number;
  }[];
};
export type Member = {
  user_id: string;
  name: string;
  email: string;
  role: string;
};
export type Conversation = {
  id: string;
  name: string;
  description: string;
  kind: "public" | "private" | "group" | "direct" | "room";
  created_by: string;
  created_at: string;
  session_id: string | null;
  member_ids: string[];
  message_count: number;
  last_message: string | null;
  last_at: string | null;
};
export type DiscussionMessage = {
  id: string;
  conversation_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};
export type DiscussionData = {
  userId: string;
  role: string;
  members: Member[];
  conversations: Conversation[];
  messages: DiscussionMessage[];
  workspaces: { id: string; name: string }[];
};
export type CanvasEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
};
