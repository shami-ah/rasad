/** SQLite schema for Rasad — executed on first run */

export const SCHEMA_SQL = `
  -- Enable WAL mode for concurrent read/write
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL CHECK(source IN ('claude-code', 'gogaa')),
    project TEXT NOT NULL,
    cwd TEXT NOT NULL,
    git_branch TEXT,
    model TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    total_input_tokens INTEGER NOT NULL DEFAULT 0,
    total_output_tokens INTEGER NOT NULL DEFAULT 0,
    total_cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
    total_cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd REAL NOT NULL DEFAULT 0,
    summary TEXT,
    version TEXT,
    entrypoint TEXT,
    file_path TEXT NOT NULL,
    file_mtime INTEGER NOT NULL,
    file_size INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    uuid TEXT NOT NULL,
    parent_uuid TEXT,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content_text TEXT NOT NULL DEFAULT '',
    content_json TEXT NOT NULL DEFAULT '[]',
    model TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    timestamp TEXT NOT NULL,
    is_sidechain INTEGER NOT NULL DEFAULT 0,
    has_thinking INTEGER NOT NULL DEFAULT 0,
    UNIQUE(session_id, uuid)
  );

  CREATE TABLE IF NOT EXISTS tool_uses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    message_uuid TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    tool_use_id TEXT NOT NULL DEFAULT '',
    input_json TEXT NOT NULL DEFAULT '{}',
    result_text TEXT,
    success INTEGER,
    duration_ms INTEGER,
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS files_touched (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('read', 'write', 'edit', 'create', 'delete')),
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sync_state (
    file_path TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    file_mtime INTEGER NOT NULL,
    file_size INTEGER NOT NULL,
    synced_at TEXT NOT NULL,
    error_count INTEGER NOT NULL DEFAULT 0
  );

  -- Indexes for common queries
  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
  CREATE INDEX IF NOT EXISTS idx_tool_uses_session ON tool_uses(session_id);
  CREATE INDEX IF NOT EXISTS idx_tool_uses_tool_name ON tool_uses(tool_name);
  CREATE INDEX IF NOT EXISTS idx_files_touched_session ON files_touched(session_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions(source);
  CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project);
  CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_model ON sessions(model);

  -- Full-text search on message content
  CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    content_text,
    content='messages',
    content_rowid='id',
    tokenize='porter unicode61'
  );

  -- Triggers to keep FTS in sync
  CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, content_text) VALUES (NEW.id, NEW.content_text);
  END;

  CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content_text) VALUES ('delete', OLD.id, OLD.content_text);
  END;

  CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content_text) VALUES ('delete', OLD.id, OLD.content_text);
    INSERT INTO messages_fts(rowid, content_text) VALUES (NEW.id, NEW.content_text);
  END;
`;
