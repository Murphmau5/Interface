use std::path::{Path, PathBuf};
use std::time::Duration;

use sqlx::migrate::Migrator;
use sqlx::sqlite::{
    SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous,
};
use sqlx::SqlitePool;

use crate::config::{ASSETS_DIR_NAME, DB_FILE_NAME};

static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

pub struct Db {
    pub pool: SqlitePool,
    pub data_dir: PathBuf,
}

impl Db {
    pub fn new(pool: SqlitePool, data_dir: PathBuf) -> Self {
        Self { pool, data_dir }
    }

    pub fn db_path(&self) -> PathBuf {
        self.data_dir.join(DB_FILE_NAME)
    }
}

pub async fn connect(data_dir: &Path) -> Result<SqlitePool, sqlx::Error> {
    std::fs::create_dir_all(data_dir).map_err(sqlx::Error::Io)?;
    std::fs::create_dir_all(data_dir.join(ASSETS_DIR_NAME)).map_err(sqlx::Error::Io)?;
    std::fs::create_dir_all(data_dir.join("objects")).map_err(sqlx::Error::Io)?;

    let options = SqliteConnectOptions::new()
        .filename(data_dir.join(DB_FILE_NAME))
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_secs(5))
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    MIGRATOR.run(&pool).await?;

    Ok(pool)
}
