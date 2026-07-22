package aegis.authz

test_allow_valid_action if {
	allow with input as {
		"agent": {"id": "agent-001", "role": "trader"},
		"action": "transfer",
		"amount": 300,
	}
}

test_deny_out_of_role_action if {
	not allow with input as {
		"agent": {"id": "agent-002", "role": "analyst"},
		"action": "transfer",
		"amount": 50,
	}
	deny_reason == "action_not_permitted" with input as {
		"agent": {"id": "agent-002", "role": "analyst"},
		"action": "transfer",
		"amount": 50,
	}
}

test_deny_over_budget_action if {
	not allow with input as {
		"agent": {"id": "agent-001", "role": "trader"},
		"action": "transfer",
		"amount": 900,
	}
	deny_reason == "budget_exceeded" with input as {
		"agent": {"id": "agent-001", "role": "trader"},
		"action": "transfer",
		"amount": 900,
	}
}
