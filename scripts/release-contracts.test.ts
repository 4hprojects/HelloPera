import { expect, it } from 'vitest';
// @ts-expect-error Operational ESM shared with release commands.
import { assertDeploymentIdentity, assertPromotion } from './release-contracts.mjs';
const sha = 'a'.repeat(40);
const evidence = {
  deploymentId: 'b'.repeat(24),
  commitSha: sha,
  status: 'HEALTHY',
  active: true,
  configurationFingerprint: 'c'.repeat(64),
  environment: 'staging',
  verification: { stagingIntegration: true, stagingBrowser: true },
  runId: '123',
};
const run = {
  conclusion: 'success',
  event: 'push',
  head_branch: 'main',
  head_sha: sha,
  path: '.github/workflows/ci.yml',
};
it('does not mistake a previous or queued healthy release for this deployment', () => {
  expect(() =>
    assertDeploymentIdentity(evidence, evidence.deploymentId, sha, true),
  ).not.toThrow();
  for (const wrong of [
    { commitSha: 'd'.repeat(40) },
    { active: false },
    { status: 'QUEUED' },
    { configurationFingerprint: null },
    { deploymentId: 'different' },
  ])
    expect(() =>
      assertDeploymentIdentity(
        { ...evidence, ...wrong },
        evidence.deploymentId,
        sha,
        true,
      ),
    ).toThrow();
});
it('promotion requires successful main CI and matching staging evidence', () => {
  expect(() => assertPromotion(run, evidence, sha, '123')).not.toThrow();
  for (const wrong of [
    { conclusion: 'failure' },
    { event: 'pull_request' },
    { head_branch: 'feature' },
    { head_sha: 'other' },
    { path: '.github/workflows/other.yml' },
  ])
    expect(() => assertPromotion({ ...run, ...wrong }, evidence, sha, '123')).toThrow();
  for (const wrong of [
    { environment: 'production' },
    { verification: { stagingIntegration: false, stagingBrowser: true } },
    { runId: '456' },
    { active: false },
    { commitSha: 'other' },
  ])
    expect(() => assertPromotion(run, { ...evidence, ...wrong }, sha, '123')).toThrow();
});
