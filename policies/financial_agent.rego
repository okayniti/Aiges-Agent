package aegis.authz

default allow := false

allow if {
	action_permitted
}

action_permitted if {
	input.action in data.permissions[input.agent.role]
}

deny_reason := "action_not_permitted" if {
	not action_permitted
}
