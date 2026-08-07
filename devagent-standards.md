# Engineering standards — learned by DevAgent

Battle-tested rules, each repeatedly confirmed by merged work.
Humans may edit; the agent treats this file as authoritative.

- An escalation/block that doesn't remove the ticket from its pickup source oscillates forever _(confirmed 19x)_
- A retry must fold the failure reason into the next attempt, or it can't converge _(confirmed 13x)_
- Refresh the branch against its base before implementing a dependent ticket _(confirmed 10x)_
- Regenerate the lockfile with registry-fresh integrity on every dependency change _(confirmed 11x)_
- Prevent at implementation time: [acceptance_criteria] Acceptance criteria could not be completed automatically: Given src/components/Navbar.test.js When its assertions are inspected Then one a _(confirmed 11x)_
