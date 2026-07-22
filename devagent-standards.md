# Engineering standards — learned by DevAgent

Battle-tested rules, each repeatedly confirmed by merged work.
Humans may edit; the agent treats this file as authoritative.

- Only bump a dependency to a version the registry actually publishes _(confirmed 13x)_
- Regenerate the lockfile with registry-fresh integrity on every dependency change _(confirmed 10x)_
