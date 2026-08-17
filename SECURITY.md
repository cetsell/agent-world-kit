# Security policy

## Supported versions

Security fixes are applied to the latest minor release.

## Reporting

Please report vulnerabilities privately through GitHub Security Advisories for
this repository. Do not open a public issue containing credentials, private
world data, or a working exploit.

## Deployment boundary

Agent World Kit is local-first and binds to `127.0.0.1`. Version 0.1 does not
include authentication or multi-tenant isolation. Do not expose it directly to
the public internet. Put an authenticated reverse proxy in front of it before
remote or shared use, protect the data directory, and restrict CORS to trusted
origins when embedding the API.

Model API keys stay on the server. The studio never receives or stores them.
