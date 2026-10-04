# HelloDeploy compatibility

Updated 25 September 2026 from the local companion source. **Online installation
version and host execution remain unverified.** See [DEPLOYMENT.md](DEPLOYMENT.md)
for the upgrade and release procedure.

| Capability | Contract |
| --- | --- |
| Runtime | Node 22 Alpine, standalone Next.js, port 3000, bind 0.0.0.0 |
| Build | Platform-generated Dockerfile; committed npm lockfile; BuildKit required |
| Network | Registry access during npm install; application build offline |
| Public config | NEXT_PUBLIC_* arguments snapshotted per deployment; same values at runtime/rollback |
| Secrets | Privileged values runtime-only; encrypted platform settings; no database credentials in app |
| Release hook | Optional full SHA validated against connected deployment branch |
| Status | Project-scoped bearer token, SHA, active state and public-config fingerprint |
| Health | /api/health for liveness; /api/health/ready for dependency monitoring |
| Upload/proxy | Existing 10 MB nginx limit and 60-second request timeout; app files limited to 8 MB |
| Scheduler | Supabase pg_cron; push caller deferred with push disabled |
| Persistence | Supabase; local container storage is ephemeral |
| Rollback | Retained healthy image; original public config; current runtime secrets |

Sharp's musl binary must be exercised using `/api/platform-check` on the actual
Alpine release. A local glibc build is not equivalent evidence. Database/storage
backups are separate from HelloDeploy image retention.
