import type { Database } from "./database";
export const env: {
  DB?: Database;
  ALLOW_LOCAL_MEDIA?: boolean;
  LIVEKIT_URL?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
} = {};
export function configureRuntime(database: Database, localMedia = false) {
  env.DB = database;
  env.ALLOW_LOCAL_MEDIA = localMedia;
  env.LIVEKIT_URL = process.env.LIVEKIT_URL;
  env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
  env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
}
