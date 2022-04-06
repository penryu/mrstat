use std::fmt;

use serde::{Deserialize, Serialize};

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

#[derive(Debug, Default, Deserialize, Serialize)]
pub struct GMMConfig {
    pub api_token: String,
    pub author_ids: Vec<i64>,
    pub gitlab_base: String,
    pub project_id: i64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Author {
    pub id: i64,
    pub name: String,
    pub username: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MergeStatus {
    Unchecked,
    Checking,
    CanBeMerged,
    CannotBeMerged,
    CannotBeMergedRecheck,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MRState {
    Opened,
    Closed,
    Merged,
}

#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Deserialize, Serialize)]
pub struct MergeRequest {
    #[serde(default)]
    pub approvals_needed: i64,
    pub author: Author,
    pub blocking_discussions_resolved: bool,
    pub draft: bool,
    pub has_conflicts: bool,
    pub iid: i64,
    pub labels: Vec<String>,
    pub merge_status: MergeStatus,
    pub source_branch: String,
    pub state: MRState,
    pub title: String,
    pub web_url: String,
    pub work_in_progress: bool,
}

impl MergeRequest {
    pub fn blockers(self: &MergeRequest) -> Vec<String> {
        let mut blockers: Vec<String> = vec![];

        if !self.blocking_discussions_resolved {
            blockers.push("unresolved threads".into());
        }

        if self.has_conflicts {
            blockers.push("has conflicts".into());
        }

        if matches!(
            self.merge_status,
            MergeStatus::CannotBeMerged | MergeStatus::CannotBeMergedRecheck
        ) {
            blockers.push("cannot be merged".into());
        }

        if self.approvals_needed > 0 {
            blockers.push(format!("requires approval ({})", self.approvals_needed));
        }

        blockers
    }
}

impl fmt::Display for MergeRequest {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let mut fields = vec![
            ("Title:", self.title.clone()),
            ("Author:", self.author.name.clone()),
            ("Branch:", self.source_branch.clone()),
            ("URL:", self.web_url.clone()),
        ];

        if !self.labels.is_empty() {
            fields.push(("Labels:", self.labels.join(", ")));
        }

        let blockers = &self.blockers();
        if !blockers.is_empty() {
            fields.push(("Blockers:", blockers.join(", ")));
        }

        let width = fields.iter().map(|field| field.0.len()).max().unwrap() + 1;

        let output = fields
            .iter()
            .map(|(k, v)| format!("{k:width$}{v:width$}\n"))
            .collect::<Vec<_>>()
            .join("");

        f.write_str(&output)
    }
}
