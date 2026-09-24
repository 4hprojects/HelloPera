export function assertDeploymentIdentity(result, id, sha, requireActive = false) {
  if (result.deploymentId !== id || result.commitSha !== sha)
    throw new Error('Deployment identity mismatch.');
  if (
    requireActive &&
    (!result.active ||
      result.status !== 'HEALTHY' ||
      !/^[a-f0-9]{64}$/.test(result.configurationFingerprint || ''))
  )
    throw new Error('Expected release is not active with a configuration snapshot.');
}
export function assertPromotion(run, evidence, sha, runId) {
  if (
    run.conclusion !== 'success' ||
    run.event !== 'push' ||
    run.head_branch !== 'main' ||
    run.head_sha !== sha ||
    run.path !== '.github/workflows/ci.yml'
  )
    throw new Error('Promotion requires successful main CI for this exact SHA.');
  if (
    evidence.commitSha !== sha ||
    evidence.environment !== 'staging' ||
    evidence.verification?.stagingIntegration !== true ||
    evidence.verification?.stagingBrowser !== true ||
    evidence.runId !== runId ||
    !evidence.active ||
    evidence.status !== 'HEALTHY' ||
    !/^[a-f0-9]{64}$/.test(evidence.configurationFingerprint || '')
  )
    throw new Error('Invalid staging release evidence.');
}
