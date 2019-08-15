const yaml = require('js-yaml');
const fs = require('fs');

fs.readFile('fetched_issues/statistics.yaml', (err, content) => {
    const loaded = yaml.safeLoad(content);
    let with_fractions = {}

    for (const name in loaded) {
        let repo = loaded[name]

        repo.fraction_of_issues_contain_bug = repo.contains_bug / repo.issues
        repo.fraction_of_bug_issues_contain_dependency = repo.contains_dependency / repo.contains_bug
        with_fractions[name] = repo
        fs.writeFileSync(
            `fetched_issues/fractions.yaml`,
            yaml.safeDump(with_fractions),
        );
    }
});