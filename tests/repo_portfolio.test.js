import test from 'node:test';
import assert from 'node:assert/strict';

const DEFAULT_PORTFOLIO = [
  { repo: 'me-agrim-rehan/reachable-vulnerability', name: 'reachable-vulnerability', owner: 'me-agrim-rehan', description: 'Security reachability analysis', openPRs: 1 },
  { repo: 'pallets/flask', name: 'flask', owner: 'pallets', description: 'The Python micro framework', openPRs: 1 },
  { repo: 'tiangolo/fastapi', name: 'fastapi', owner: 'tiangolo', description: 'FastAPI framework', openPRs: 0 },
  { repo: 'psf/requests', name: 'requests', owner: 'psf', description: 'Python HTTP for Humans', openPRs: 0 },
];

function createPortfolioManager(initialList = DEFAULT_PORTFOLIO) {
  let list = initialList.slice();

  function parseGitHubInput(input) {
    if (!input) return null;
    const raw = input.trim();
    const repoMatch = raw.match(/github\.com\/([\w.\-]+)\/([\w.\-]+?)(?:\.git)?(?:[\/#?].*)?$/i);
    if (repoMatch) return { repo: `${repoMatch[1]}/${repoMatch[2]}` };
    const shortMatch = raw.match(/^([\w.\-]+)\/([\w.\-]+)$/i);
    if (shortMatch) return { repo: `${shortMatch[1]}/${shortMatch[2]}` };
    return null;
  }

  function getPortfolio() {
    return list.slice();
  }

  function addRepoToPortfolio(repoInput) {
    const parsed = parseGitHubInput(repoInput);
    if (!parsed || !parsed.repo) {
      throw new Error("Invalid GitHub repository format. Use 'owner/repo' or a full URL.");
    }
    const exists = list.some((x) => x.repo.toLowerCase() === parsed.repo.toLowerCase());
    if (exists) {
      throw new Error(`${parsed.repo} is already in your portfolio!`);
    }
    const [owner, name] = parsed.repo.split('/');
    const newItem = {
      repo: parsed.repo,
      owner,
      name,
      description: 'Custom repository',
      openPRs: 1,
    };
    list.unshift(newItem);
    return newItem;
  }

  function removeRepoFromPortfolio(repo) {
    list = list.filter((x) => x.repo.toLowerCase() !== repo.toLowerCase());
  }

  return { getPortfolio, addRepoToPortfolio, removeRepoFromPortfolio };
}

test('Multi-Repository Portfolio Management (SortFolio Portfolio Hub)', async (t) => {
  await t.test('initializes portfolio with user repository and canonical targets', () => {
    const manager = createPortfolioManager();
    const portfolio = manager.getPortfolio();
    assert.equal(portfolio.length, 4);
    assert.ok(portfolio.some((r) => r.repo === 'me-agrim-rehan/reachable-vulnerability'));
    assert.ok(portfolio.some((r) => r.repo === 'pallets/flask'));
  });

  await t.test('addRepoToPortfolio: adds new repository by shorthand owner/name', () => {
    const manager = createPortfolioManager();
    const added = manager.addRepoToPortfolio('expressjs/express');
    assert.equal(added.repo, 'expressjs/express');
    assert.equal(added.owner, 'expressjs');
    assert.equal(added.name, 'express');

    const portfolio = manager.getPortfolio();
    assert.equal(portfolio.length, 5);
    assert.equal(portfolio[0].repo, 'expressjs/express');
  });

  await t.test('addRepoToPortfolio: adds new repository by full URL', () => {
    const manager = createPortfolioManager();
    const added = manager.addRepoToPortfolio('https://github.com/django/django');
    assert.equal(added.repo, 'django/django');

    const portfolio = manager.getPortfolio();
    assert.equal(portfolio[0].repo, 'django/django');
  });

  await t.test('addRepoToPortfolio: prevents duplicate repository additions', () => {
    const manager = createPortfolioManager();
    assert.throws(() => {
      manager.addRepoToPortfolio('pallets/flask');
    }, /already in your portfolio/i);
  });

  await t.test('addRepoToPortfolio: rejects invalid formats', () => {
    const manager = createPortfolioManager();
    assert.throws(() => {
      manager.addRepoToPortfolio('invalid-repo-name');
    }, /invalid github repository format/i);
  });

  await t.test('removeRepoFromPortfolio: removes repository from tracked portfolio', () => {
    const manager = createPortfolioManager();
    manager.removeRepoFromPortfolio('psf/requests');
    const portfolio = manager.getPortfolio();
    assert.equal(portfolio.length, 3);
    assert.ok(!portfolio.some((r) => r.repo === 'psf/requests'));
  });
});
