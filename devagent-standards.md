# Engineering standards — learned by DevAgent

Battle-tested rules, each repeatedly confirmed by merged work.
Humans may edit; the agent treats this file as authoritative.

- An escalation/block that doesn't remove the ticket from its pickup source oscillates forever _(confirmed 18x)_
- Refresh the branch against its base before implementing a dependent ticket _(confirmed 6x)_
- Only bump a dependency to a version the registry actually publishes _(confirmed 13x)_
- Regenerate the lockfile with registry-fresh integrity on every dependency change _(confirmed 11x)_
