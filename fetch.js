const request = require('request');
const yaml = require('js-yaml');
const fs = require('fs');
require('dotenv').config();

let checkedRepositories = {};

const headers = {
  Authorization: 'Basic ' +
    Buffer.from(
      'andersfischernielsen' + ':' + process.env.PASS,
      'utf8',
    ).toString('base64'),
  'User-Agent': 'andersfischernielsen',
};

const checkCommentsForSingleIssue = (issueURL, name, issuesLength) => {
  request(issueURL, {
      json: true,
      headers: headers,
    },
    (err, res, comments) => {
      if (err) console.error(err);
      if (comments && res.statusCode === 403) {
        console.error('Rate limit exceeded!');
        process.exit(1);
      }
      if (comments && res.statusCode === 200 && comments.length > 0) {
        const stats = {
          name: name,
          issues: issuesLength,
          contains_bug: comments.filter((i) => i.body && i.body.match("bug")).length > 0 ? 1 : 0,
          contains_dependency: comments.filter((i) => i.body && i.body.match("dependency")).length > 0 ? 1 : 0,
        };
        checkedRepositories[stats.name].contains_dependency += stats.contains_dependency;
        checkedRepositories[stats.name].contains_bug += stats.contains_bug;

        const sorted = Object.fromEntries(
          Object.entries(checkedRepositories).filter(
            ([_, v]) => v.issues >= 100,
          ),
        );
        fs.writeFileSync(
          `fetched_issues/statistics.yaml`,
          yaml.safeDump(sorted),
        );
      }
    }
  )
}

const makeRequest = (issueURL) => {
  request(
    issueURL, {
      json: true,
      headers: headers,
    },
    (err, res, issues) => {
      if (err) console.error(err);
      if (issues && res.statusCode === 403) {
        console.error('Rate limit exceeded!');
        process.exit(1);
      }
      if (issues && res.statusCode === 200 && issues.length > 0) {
        try {
          const name = issues[0].repository_url
            .replace('https://api.github.com/repos/', '')
            .replace(/.*\//, '');
          const stats = {
            name: name,
            issues: issues.length,
            contains_bug: issues.filter((i) => i.title && i.title.match("bug") || i.body && i.body.match("bug")).length,
            contains_dependency: issues.filter((i) => i.title && i.title.match("dependency") || i.body && i.body.match("dependency")).length,
          };

          if (!checkedRepositories[stats.name])
            checkedRepositories[stats.name] = stats;
          else {
            checkedRepositories[stats.name].issues += stats.issues;
            checkedRepositories[stats.name].contains_dependency += stats.contains_dependency;
          }

          let timeout = 0
          for (let i = 0; i < issues.length - 1; i++) {
            const issue = issues[i]
            if (issue.title && !issue.title.match("dependency") || issue.body && !issue.body.match("dependency")) {
              setTimeout(() => checkCommentsForSingleIssue(`${issueURL.replace(/\?{1}.+/, "")}/${issue.number}/comments`, stats.name, stats.issues), timeout)
              timeout += 2000
            }
          }

          const sorted = Object.fromEntries(
            Object.entries(checkedRepositories).filter(
              ([_, v]) => v.issues >= 100,
            ),
          );
          fs.writeFileSync(
            `fetched_issues/checked.yaml`,
            yaml.safeDump(checkedRepositories),
          );
          fs.writeFileSync(
            `fetched_issues/statistics.yaml`,
            yaml.safeDump(sorted),
          );

          if (issues.length == 100) {
            const pagestart = issueURL.indexOf('page=');
            const page = +issueURL.slice(pagestart + 5, issueURL.length)[0] + 1;
            const url =
              issueURL.slice(0, pagestart + 5) + page + 'per_page=100';
            makeRequest(url);
          }
        } catch (err) {
          console.error(err);
        }
      }
    },
  );
};

fs.readFile('fetched_issues/checked.yaml', (err, content) => {
  const loaded = yaml.safeLoad(content);
  checkedRepositories = loaded && loaded != 'undefined' ? loaded : {};

  fs.readFile('data/22-06-2019-distribution.yaml', (err, content) => {
    const loaded = yaml.safeLoad(content);
    let repositories = loaded.repositories;

    for (let name in checkedRepositories) {
      delete repositories[`${name}`];
    }

    let timeout = 0;
    for (const name in repositories) {
      const repo = repositories[`${name}`];
      if (!repo.source) continue;
      let url = repo.source.url;
      if (url.match('bitbucket')) continue;
      const split = url.split(/\.|github.com/);
      split.splice(1, 0, 'api.github.com/repos');
      split[3] = '/issues?state=all&page=1&per_page=100';
      const issueURL = split.join('');
      setTimeout(() => makeRequest(issueURL), timeout);
      timeout += 3000;
    }
  }, );
});