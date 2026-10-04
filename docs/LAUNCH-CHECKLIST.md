# Public launch checklist

The authoritative status is [LAUNCH-IMPLEMENTATION.md](LAUNCH-IMPLEMENTATION.md).
Follow [DEPLOYMENT.md](DEPLOYMENT.md) for settings and release commands.

- [ ] Upgrade and verify HelloDeploy, including build snapshots, SHA hooks and rollback.
- [ ] Configure separate staging and production projects, credentials, DNS and TLS.
- [ ] Configure GitHub environments and required checks; disable platform auto-deploy.
- [ ] Obtain a successful staging release artifact with authenticated/concurrency tests.
- [ ] Verify SMTP, enabled OAuth flows and the support mailbox.
- [ ] Restore the database and document bytes into a separate target; record duration.
- [ ] Complete performance and real-device checks.
- [ ] Connect monitoring and acknowledge an induced alert.
- [ ] Record evidence, set production `LAUNCH_GATES_CONFIRMED=true`, and manually promote.
- [ ] Verify production and record the retained rollback release.

Payments, premium, ads, AI/OCR and push remain disabled. They require separate releases.
