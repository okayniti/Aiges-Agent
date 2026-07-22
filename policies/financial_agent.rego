package aegis.authz

default allow := false

allow if {
	action_permitted
	within_budget
}

action_permitted if {
	input.action in data.permissions[input.agent.role]
}

within_budget if {
	input.amount <= (data.caps[input.agent.id] - data.spent[input.agent.id])
}

deny_reason := "action_not_permitted" if {
	not action_permitted
}

deny_reason := "budget_exceeded" if {
	action_permitted
	not within_budget
}
