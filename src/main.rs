#![warn(clippy::pedantic)]

mod gitlab;
mod types;

use gitlab::GitLab;
use types::{GMMConfig, MergeRequest, Result};

#[tokio::main]
async fn main() -> Result<()> {
    pretty_env_logger::init();

    let GMMConfig {
        api_token,
        author_ids,
        gitlab_base,
        project_id,
    } = confy::load("gitlab-mr-monitor")?;

    let gitlab = GitLab::new(&gitlab_base, project_id, &api_token);

    let mrs: Vec<MergeRequest> = gitlab
        .get_matching("main", |mr| author_ids.contains(&mr.author.id))
        .await?;

    let (ready, blocked): (Vec<MergeRequest>, Vec<MergeRequest>) = mrs
        .into_iter()
        .partition(|mr: &MergeRequest| mr.blockers().is_empty());

    println!("*Open MRs against main:*\n");

    if !ready.is_empty() {
        print!("{}", slack_format("Ready to Merge", &ready));
    }

    if !blocked.is_empty() {
        print!("{}", slack_format("Blocked", &blocked));
    }

    Ok(())
}

fn slack_format(header: &str, mrs: &[MergeRequest]) -> String {
    let mut output = format!("* *{header}*\n");

    for mr in mrs {
        output.push_str(&format!(
            "    * [{}]({}) ({})\n",
            mr.title, mr.web_url, mr.author.username
        ));

        if !mr.labels.is_empty() {
            output.push_str(&format!("        * Labels: {}\n", &mr.labels.join(", ")));
        }

        let blockers = &mr.blockers();
        if !blockers.is_empty() {
            output.push_str(&format!("        * {}\n", blockers.join(", ")));
        }
    }

    output
}
