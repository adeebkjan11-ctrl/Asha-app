# Deploy the shared workspace

Use the server package or clone this repository. Install Node.js 24, or use Docker Compose. Run a single server instance for the initial SQLite pilot. Bind its port to loopback and route HTTPS through your reverse proxy.

```sh
docker compose up -d --build
docker compose exec asha cat /data/bootstrap-token
```

Create the first administrator through **Set up workspace** using that one-time token. Access is restricted after the first account is created. You can instead supply a strong `ASHA_SETUP_TOKEN` environment variable before first startup. Never publish it or reuse an example password.

Environment settings:

| Setting | Purpose | Default |
| --- | --- | --- |
| `PORT` | HTTP listener port | `8787` |
| `HOST` | Listener address | `127.0.0.1` locally; `0.0.0.0` in Docker |
| `ASHA_DATA_DIR` | Persistent database/key directory | `data` |
| `ASHA_SETUP_TOKEN` | Optional first-administrator bootstrap token | Generated in the data directory |
| `ASHA_ALLOWED_ORIGINS` | Comma-separated extra client origins | `https://appassets.androidplatform.net` |
| `NODE_ENV` | Enables production transport headers | `production` in Docker |

Example Caddy reverse proxy configuration (replace the example hostname with one you control):

```caddy
asha.example.org {
    reverse_proxy 127.0.0.1:8787
}
```

Keep the app’s server URL at the origin, such as `https://asha.example.org`, without an additional path. Preserve the original Host header at the reverse proxy. Additional browser frontends need their exact HTTPS origin in `ASHA_ALLOWED_ORIGINS`; never use a wildcard. The server does not grant cookie-based authentication, and bearer session tokens remain in the client’s memory.

## Backups and recovery

Stop the app while taking a consistent copy of the **entire** data directory or Docker volume. Include the database, WAL files if present, encryption key and bootstrap metadata. Protect backups separately from the running server and restrict operator access. Test restoring a copy to a separate instance before a live pilot. Never share backups as workflow artifacts.

The SQLite database contains encrypted health-record payloads. Account metadata and audit identifiers are not encrypted. The decryption key is a protected local file; the deployment operator remains responsible for host access, disk and backup protection, and key management. This is application encryption, not end-to-end encryption that hides data from an authorised server operator.

Use organisation-owned administrator accounts and an access policy for document downloads and exports. A privacy notice, local operating authority, relevant retention rules and handling of children’s records must be agreed by the deploying health organisation. No production hosting or data-processing agreement is created by running this build.

## Maintenance

Keep Node.js, the OS and Android System WebView updated. Monitor disk space and failed syncs, rotate accounts when staff change, and retain a support contact. Rate-limited login is built in. MFA/SSO, central key management, stronger enterprise device controls, and multiple-server deployment should be added before a broad rollout. HTTPS termination, backup operations and monitoring are deployment responsibilities, not automated by the APK.
