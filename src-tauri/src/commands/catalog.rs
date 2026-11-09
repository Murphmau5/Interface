use serde::Serialize;
use sqlx::FromRow;
use tauri::State;

use crate::db::Db;
use crate::error::AppError;

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
struct CategoryRow {
    id: String,
    domain: String,
    group_label: String,
    label: String,
    count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogCategory {
    pub id: String,
    pub label: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogGroup {
    pub label: String,
    pub categories: Vec<CatalogCategory>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogDomain {
    pub domain: String,
    pub total: i64,
    pub groups: Vec<CatalogGroup>,
}

/// 内容域固定顺序，与左栏一级导航保持一致
const DOMAIN_ORDER: [&str; 5] = ["style", "motion", "feedback", "component", "theme"];

/// 域 → 组 → 类目，计数为真实统计（软删除不计）
#[tauri::command]
pub async fn catalog_list(db: State<'_, Db>) -> Result<Vec<CatalogDomain>, AppError> {
    let rows: Vec<CategoryRow> = sqlx::query_as(
        r#"
        SELECT c.id,
               c.domain,
               c.group_label,
               c.label,
               COUNT(a.id) AS count
        FROM categories c
        LEFT JOIN cases a
               ON a.category_id = c.id AND a.deleted_at IS NULL
        GROUP BY c.id
        ORDER BY c.sort_order ASC, c.id ASC
        "#,
    )
    .fetch_all(&db.pool)
    .await?;

    let mut domains: Vec<CatalogDomain> = Vec::with_capacity(DOMAIN_ORDER.len());

    for row in rows {
        let index = match domains.iter().position(|d| d.domain == row.domain) {
            Some(index) => index,
            None => {
                domains.push(CatalogDomain {
                    domain: row.domain.clone(),
                    total: 0,
                    groups: Vec::new(),
                });
                domains.len() - 1
            }
        };

        let domain = &mut domains[index];
        domain.total += row.count;

        let group_index = match domain
            .groups
            .iter()
            .position(|group| group.label == row.group_label)
        {
            Some(index) => index,
            None => {
                domain.groups.push(CatalogGroup {
                    label: row.group_label.clone(),
                    categories: Vec::new(),
                });
                domain.groups.len() - 1
            }
        };

        domain.groups[group_index].categories.push(CatalogCategory {
            id: row.id,
            label: row.label,
            count: row.count,
        });
    }

    domains.sort_by_key(|domain| {
        DOMAIN_ORDER
            .iter()
            .position(|key| *key == domain.domain)
            .unwrap_or(usize::MAX)
    });

    Ok(domains)
}
