package aegis.authz

test_allow_wealth_advisory_permitted_action if {
	allow with input as {
		"agent": {"id": "wealth-001", "role": "wealth_advisory"},
		"action": "transfer",
		"amount": 300,
	}
}

test_allow_hft_permitted_action if {
	allow with input as {
		"agent": {"id": "hft-001", "role": "hft"},
		"action": "query_balance",
		"amount": 0,
	}
}

test_deny_rogue_any_action if {
	not allow with input as {
		"agent": {"id": "rogue-001", "role": "rogue"},
		"action": "transfer",
		"amount": 50,
	}
	deny_reason == "action_not_permitted" with input as {
		"agent": {"id": "rogue-001", "role": "rogue"},
		"action": "transfer",
		"amount": 50,
	}
}
