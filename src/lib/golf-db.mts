import type Database from "better-sqlite3";

export function migrateGolf(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS golf_profiles (
      user_id TEXT PRIMARY KEY REFERENCES user(id), legacy_id TEXT UNIQUE,
      name TEXT NOT NULL, handle TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS golf_courses (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, location TEXT NOT NULL,
      owner_id TEXT REFERENCES user(id), source TEXT NOT NULL, document TEXT NOT NULL CHECK(json_valid(document))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS golf_profile_handle_nocase ON golf_profiles(handle COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS golf_course_name ON golf_courses(name COLLATE NOCASE);
    CREATE TABLE IF NOT EXISTS golf_players (
      id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES user(id),
      account_id TEXT REFERENCES user(id), name TEXT NOT NULL, color TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)), PRIMARY KEY(owner_id,id)
    );
    CREATE TABLE IF NOT EXISTS golf_rounds (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES user(id),
      course_id TEXT, started_at TEXT NOT NULL, finished INTEGER NOT NULL CHECK(finished IN (0,1)),
      visibility TEXT NOT NULL CHECK(visibility IN ('private','friends')),
      version INTEGER NOT NULL, document TEXT NOT NULL CHECK(json_valid(document))
    );
    CREATE INDEX IF NOT EXISTS golf_round_owner_date ON golf_rounds(owner_id,started_at DESC,id);
    CREATE TABLE IF NOT EXISTS golf_friendships (
      user_id TEXT NOT NULL REFERENCES user(id), friend_id TEXT NOT NULL REFERENCES user(id),
      PRIMARY KEY(user_id,friend_id), CHECK(user_id != friend_id)
    );
    CREATE TABLE IF NOT EXISTS golf_requests (
      id TEXT PRIMARY KEY, from_id TEXT NOT NULL REFERENCES user(id), to_id TEXT NOT NULL REFERENCES user(id),
      status TEXT NOT NULL, created_at TEXT NOT NULL, CHECK(from_id != to_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS golf_pending_request ON golf_requests(
      min(from_id,to_id),max(from_id,to_id)
    ) WHERE status='pending';
    CREATE TABLE IF NOT EXISTS golf_comments (
      id TEXT PRIMARY KEY, round_id TEXT NOT NULL REFERENCES golf_rounds(id),
      user_id TEXT NOT NULL REFERENCES user(id), body TEXT NOT NULL, created_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS golf_comment_round ON golf_comments(round_id,created_at);
    CREATE TABLE IF NOT EXISTS golf_likes (
      round_id TEXT NOT NULL REFERENCES golf_rounds(id), user_id TEXT NOT NULL REFERENCES user(id),
      PRIMARY KEY(round_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS golf_stat_definitions (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES user(id), label TEXT NOT NULL,
      value_type TEXT NOT NULL CHECK(value_type IN ('binary','integer')), deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS golf_mutations (
      user_id TEXT NOT NULL REFERENCES user(id), id TEXT NOT NULL,
      fingerprint TEXT NOT NULL, result TEXT NOT NULL CHECK(json_valid(result)), PRIMARY KEY(user_id,id)
    );
    CREATE TABLE IF NOT EXISTS golf_imports (
      digest TEXT PRIMARY KEY, imported_at TEXT NOT NULL, report TEXT NOT NULL CHECK(json_valid(report))
    );
    CREATE TABLE IF NOT EXISTS golf_legacy (
      source TEXT NOT NULL REFERENCES golf_imports(digest), table_name TEXT NOT NULL,
      row_number INTEGER NOT NULL, document TEXT NOT NULL CHECK(json_valid(document)),
      PRIMARY KEY(source,table_name,row_number)
    );
  `);
}
