use futures::{stream, StreamExt};
use log::{debug, trace};
use reqwest::{
    header::{HeaderMap, HeaderValue, AUTHORIZATION},
    Client, Response,
};
use serde_json::Value;

use crate::types::{MergeRequest, Result};

pub struct GitLab {
    base_url: String,
    client: Client,
    project_id: i64,
}

impl GitLab {
    pub fn new(base_url: &str, project_id: i64, api_token: &str) -> Self {
        debug!("Constructing GitLab client");

        let mut auth_value = HeaderValue::try_from(format!("Bearer {}", api_token)).unwrap();
        auth_value.set_sensitive(true);

        let mut headers = HeaderMap::new();
        headers.insert(AUTHORIZATION, auth_value);

        let client = Client::builder().default_headers(headers).build().unwrap();

        GitLab {
            base_url: base_url.to_string(),
            client,
            project_id,
        }
    }

    pub async fn get_matching<F>(&self, branch: &str, pred: F) -> Result<Vec<MergeRequest>>
    where
        F: Fn(&MergeRequest) -> bool,
    {
        let params = &[
            ("state", "opened"),
            ("scope", "all"),
            ("target_branch", branch),
        ];

        let uri = format!("/projects/{}/merge_requests", self.project_id);
        let resp = self.get(&uri, params).await?.text().await?;
        trace!("API response: {}", &resp);

        let mut mrs: Vec<MergeRequest> = serde_json::from_str(&resp)?;
        mrs.retain(pred);

        let mr_iids = &mrs.iter().map(|mr| mr.iid).collect::<Vec<_>>();
        debug!("iids for matching MRs: {:?}", &mr_iids);

        let mr_tuples: Vec<(i64, i64)> = stream::iter(mr_iids)
            .map(|iid| {
                let approval_uri = format!(
                    "{}/projects/{}/merge_requests/{}/approvals",
                    self.base_url, self.project_id, iid
                );
                let client = &self.client;
                async move {
                    let resp = client.get(approval_uri).send().await?.text().await?;
                    let value: Value = serde_json::from_str(&resp[..])?;
                    let approvals_needed: i64 = value
                        .get("approvals_left")
                        .and_then(Value::as_i64)
                        .ok_or_else(|| "no approval data".to_string())?;
                    Ok((*iid, approvals_needed))
                }
            })
            .buffer_unordered(mr_iids.len())
            .collect::<Vec<Result<(i64, i64)>>>()
            .await
            .into_iter()
            .collect::<Result<Vec<(i64, i64)>>>()?;
        debug!("iids with approvals_needed: {:?}", &mr_tuples);

        for mr in &mut mrs {
            for (iid, approvals_needed) in &mr_tuples {
                if mr.iid == *iid {
                    debug!(
                        "Updating approvals_needed for MR {} from {} -> {}",
                        iid, mr.approvals_needed, approvals_needed
                    );
                    mr.approvals_needed = *approvals_needed;
                }
            }
        }

        Ok(mrs)
    }

    async fn get(&self, uri: &str, query: &[(&str, &str)]) -> Result<Response> {
        let uri = format!("{}{}", self.base_url, uri);
        let resp = self.client.get(uri).query(query).send().await?;
        Ok(resp)
    }
}
