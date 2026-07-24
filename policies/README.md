# policies

Open Policy Agent (OPA) Rego policy files that define what an autonomous agent is and
isn't allowed to do. These policies are evaluated by OPA on every request the gateway
proxies, independent of the gateway's own code.

`financial_agent.rego` answers one question: is this action permitted for this agent's
role? Roles and their permitted actions live in `data.json`. A role with no entry, or an
action not in its list, is denied with `action_not_permitted`.

Policy is scoped to role/action decisions only. Budget enforcement deliberately lives in
the gateway against Redis instead, where spend can be checked and incremented atomically
per request — OPA has no access to live spend state.

Tests are in `financial_agent_test.rego`:

```bash
docker exec infra-opa-1 opa test /policies -v      # expect PASS: 3/3
```
