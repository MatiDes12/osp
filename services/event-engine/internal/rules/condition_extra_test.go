package rules

import (
	"testing"
)

// TestEvaluateCondition_EdgeCases adds edge case tests beyond the existing condition_test.go.
func TestEvaluateCondition_EdgeCases(t *testing.T) {
	tests := []struct {
		name     string
		node     ConditionNode
		data     map[string]interface{}
		expected bool
	}{
		// Deeply nested conditions (3+ levels)
		{
			name: "3 levels deep - AND > OR > AND",
			node: ConditionNode{
				Logic: "and",
				Children: []ConditionNode{
					{Field: "severity", Operator: "eq", Value: "high"},
					{
						Logic: "or",
						Children: []ConditionNode{
							{
								Logic: "and",
								Children: []ConditionNode{
									{Field: "type", Operator: "eq", Value: "motion"},
									{Field: "intensity", Operator: "gt", Value: float64(0.8)},
								},
							},
							{
								Logic: "and",
								Children: []ConditionNode{
									{Field: "type", Operator: "eq", Value: "person"},
									{Field: "intensity", Operator: "gt", Value: float64(0.5)},
								},
							},
						},
					},
				},
			},
			data:     map[string]interface{}{"severity": "high", "type": "person", "intensity": float64(0.7)},
			expected: true,
		},
		{
			name: "3 levels deep - all fail at leaf",
			node: ConditionNode{
				Logic: "and",
				Children: []ConditionNode{
					{Field: "severity", Operator: "eq", Value: "high"},
					{
						Logic: "or",
						Children: []ConditionNode{
							{
								Logic: "and",
								Children: []ConditionNode{
									{Field: "type", Operator: "eq", Value: "motion"},
									{Field: "intensity", Operator: "gt", Value: float64(0.8)},
								},
							},
							{
								Logic: "and",
								Children: []ConditionNode{
									{Field: "type", Operator: "eq", Value: "person"},
									{Field: "intensity", Operator: "gt", Value: float64(0.9)},
								},
							},
						},
					},
				},
			},
			data:     map[string]interface{}{"severity": "high", "type": "person", "intensity": float64(0.7)},
			expected: false,
		},
		{
			name: "4 levels deep nesting",
			node: ConditionNode{
				Logic: "or",
				Children: []ConditionNode{
					{
						Logic: "and",
						Children: []ConditionNode{
							{
								Logic: "or",
								Children: []ConditionNode{
									{
										Logic: "and",
										Children: []ConditionNode{
											{Field: "a", Operator: "eq", Value: "1"},
											{Field: "b", Operator: "eq", Value: "2"},
										},
									},
								},
							},
						},
					},
				},
			},
			data:     map[string]interface{}{"a": "1", "b": "2"},
			expected: true,
		},

		// Empty string comparisons
		{
			name:     "empty string equality - match",
			node:     ConditionNode{Field: "zone_id", Operator: "eq", Value: ""},
			data:     map[string]interface{}{"zone_id": ""},
			expected: true,
		},
		{
			name:     "empty string equality - no match",
			node:     ConditionNode{Field: "zone_id", Operator: "eq", Value: ""},
			data:     map[string]interface{}{"zone_id": "zone-1"},
			expected: false,
		},
		{
			name:     "empty string neq - match",
			node:     ConditionNode{Field: "zone_id", Operator: "neq", Value: ""},
			data:     map[string]interface{}{"zone_id": "zone-1"},
			expected: true,
		},
		{
			name:     "empty string contains empty string",
			node:     ConditionNode{Field: "name", Operator: "contains", Value: ""},
			data:     map[string]interface{}{"name": "anything"},
			expected: true,
		},

		// Numeric string vs actual number comparison
		{
			name:     "numeric equality with int field vs float condition",
			node:     ConditionNode{Field: "count", Operator: "eq", Value: float64(5)},
			data:     map[string]interface{}{"count": 5},
			expected: true,
		},
		{
			name:     "numeric gt with int values",
			node:     ConditionNode{Field: "count", Operator: "gt", Value: 3},
			data:     map[string]interface{}{"count": 5},
			expected: true,
		},
		{
			name:     "numeric comparison with int32",
			node:     ConditionNode{Field: "count", Operator: "gte", Value: int32(10)},
			data:     map[string]interface{}{"count": int32(10)},
			expected: true,
		},
		{
			name:     "numeric comparison with int64",
			node:     ConditionNode{Field: "count", Operator: "lt", Value: int64(100)},
			data:     map[string]interface{}{"count": int64(50)},
			expected: true,
		},
		{
			name:     "numeric comparison with float32",
			node:     ConditionNode{Field: "score", Operator: "lte", Value: float32(0.9)},
			data:     map[string]interface{}{"score": float32(0.5)},
			expected: true,
		},
		{
			name:     "string vs number - eq uses fmt.Sprintf coercion",
			node:     ConditionNode{Field: "count", Operator: "eq", Value: "5"},
			data:     map[string]interface{}{"count": 5},
			expected: true,
		},
		{
			name:     "non-numeric string gt comparison returns false",
			node:     ConditionNode{Field: "name", Operator: "gt", Value: "abc"},
			data:     map[string]interface{}{"name": "def"},
			expected: false,
		},

		// Array "in" with mixed types
		{
			name:     "in with mixed numeric types in []interface{}",
			node:     ConditionNode{Field: "code", Operator: "in", Value: []interface{}{1, "2", 3.0}},
			data:     map[string]interface{}{"code": 1},
			expected: true,
		},
		{
			name:     "in with float in list matching int field",
			node:     ConditionNode{Field: "code", Operator: "in", Value: []interface{}{1.0, 2.0, 3.0}},
			data:     map[string]interface{}{"code": 1},
			expected: true,
		},
		{
			name:     "in with non-slice value returns false",
			node:     ConditionNode{Field: "code", Operator: "in", Value: "not-a-slice"},
			data:     map[string]interface{}{"code": "not-a-slice"},
			expected: false,
		},
		{
			name:     "in with empty slice returns false",
			node:     ConditionNode{Field: "code", Operator: "in", Value: []interface{}{}},
			data:     map[string]interface{}{"code": "anything"},
			expected: false,
		},
		{
			name:     "in with nil value returns false",
			node:     ConditionNode{Field: "code", Operator: "in", Value: nil},
			data:     map[string]interface{}{"code": "anything"},
			expected: false,
		},

		// not_contains operator
		{
			name:     "not_contains - substring absent",
			node:     ConditionNode{Field: "name", Operator: "not_contains", Value: "garage"},
			data:     map[string]interface{}{"name": "front door camera"},
			expected: true,
		},
		{
			name:     "not_contains - substring present",
			node:     ConditionNode{Field: "name", Operator: "not_contains", Value: "front"},
			data:     map[string]interface{}{"name": "front door camera"},
			expected: false,
		},
		{
			name:     "not_contains - empty substring always false (everything contains empty)",
			node:     ConditionNode{Field: "name", Operator: "not_contains", Value: ""},
			data:     map[string]interface{}{"name": "anything"},
			expected: false,
		},

		// Unknown operator
		{
			name:     "unknown operator returns false",
			node:     ConditionNode{Field: "type", Operator: "regex", Value: ".*"},
			data:     map[string]interface{}{"type": "motion"},
			expected: false,
		},

		// Unknown logic type
		{
			name: "unknown logic returns false",
			node: ConditionNode{
				Logic: "xor",
				Children: []ConditionNode{
					{Field: "type", Operator: "eq", Value: "motion"},
				},
			},
			data:     map[string]interface{}{"type": "motion"},
			expected: false,
		},

		// Nil data map fields
		{
			name:     "nil value in data field - equality",
			node:     ConditionNode{Field: "zone_id", Operator: "eq", Value: nil},
			data:     map[string]interface{}{"zone_id": nil},
			expected: true,
		},
		{
			name:     "nil value in data - neq non-nil",
			node:     ConditionNode{Field: "zone_id", Operator: "neq", Value: "zone-1"},
			data:     map[string]interface{}{"zone_id": nil},
			expected: true,
		},

		// Single child in group
		{
			name: "AND with single child - true",
			node: ConditionNode{
				Logic: "and",
				Children: []ConditionNode{
					{Field: "type", Operator: "eq", Value: "motion"},
				},
			},
			data:     map[string]interface{}{"type": "motion"},
			expected: true,
		},
		{
			name: "OR with single child - false",
			node: ConditionNode{
				Logic: "or",
				Children: []ConditionNode{
					{Field: "type", Operator: "eq", Value: "person"},
				},
			},
			data:     map[string]interface{}{"type": "motion"},
			expected: false,
		},

		// Case sensitivity of logic
		{
			name: "AND logic is case-insensitive",
			node: ConditionNode{
				Logic: "AND",
				Children: []ConditionNode{
					{Field: "type", Operator: "eq", Value: "motion"},
				},
			},
			data:     map[string]interface{}{"type": "motion"},
			expected: true,
		},
		{
			name: "Or logic mixed case",
			node: ConditionNode{
				Logic: "Or",
				Children: []ConditionNode{
					{Field: "type", Operator: "eq", Value: "motion"},
				},
			},
			data:     map[string]interface{}{"type": "motion"},
			expected: true,
		},

		// Empty data map
		{
			name:     "empty data map - field missing",
			node:     ConditionNode{Field: "type", Operator: "eq", Value: "motion"},
			data:     map[string]interface{}{},
			expected: false,
		},

		// Boolean field comparisons
		{
			name:     "boolean neq",
			node:     ConditionNode{Field: "active", Operator: "neq", Value: false},
			data:     map[string]interface{}{"active": true},
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := EvaluateCondition(tt.node, tt.data)
			if result != tt.expected {
				t.Errorf("EvaluateCondition() = %v, want %v", result, tt.expected)
			}
		})
	}
}

// TestEvaluateCondition_LargeTree tests performance with a large condition tree.
func TestEvaluateCondition_LargeTree(t *testing.T) {
	// Build an AND node with 100 children, all matching.
	children := make([]ConditionNode, 100)
	data := make(map[string]interface{})
	for i := 0; i < 100; i++ {
		field := "field_" + string(rune('a'+i%26)) + string(rune('0'+i/26))
		children[i] = ConditionNode{
			Field:    field,
			Operator: "eq",
			Value:    "yes",
		}
		data[field] = "yes"
	}

	node := ConditionNode{
		Logic:    "and",
		Children: children,
	}

	result := EvaluateCondition(node, data)
	if !result {
		t.Error("expected large AND tree with all matching children to return true")
	}

	// Make one child fail.
	children[50].Value = "no"
	result = EvaluateCondition(node, data)
	if result {
		t.Error("expected large AND tree with one failing child to return false")
	}
}

// TestEvaluateCondition_LargeORTree tests a large OR tree with one match.
func TestEvaluateCondition_LargeORTree(t *testing.T) {
	children := make([]ConditionNode, 100)
	data := map[string]interface{}{"target": "match"}

	for i := 0; i < 100; i++ {
		children[i] = ConditionNode{
			Field:    "target",
			Operator: "eq",
			Value:    "no-match",
		}
	}

	// Only the last child matches.
	children[99].Value = "match"

	node := ConditionNode{
		Logic:    "or",
		Children: children,
	}

	result := EvaluateCondition(node, data)
	if !result {
		t.Error("expected large OR tree with last child matching to return true")
	}
}

// TestEvaluateCondition_DeeplyNested5Levels tests 5 levels of nesting.
func TestEvaluateCondition_DeeplyNested5Levels(t *testing.T) {
	// Level 5 (innermost): leaf
	leaf := ConditionNode{Field: "type", Operator: "eq", Value: "motion"}

	// Build up layers.
	level4 := ConditionNode{Logic: "and", Children: []ConditionNode{leaf}}
	level3 := ConditionNode{Logic: "or", Children: []ConditionNode{level4}}
	level2 := ConditionNode{Logic: "and", Children: []ConditionNode{level3}}
	level1 := ConditionNode{Logic: "or", Children: []ConditionNode{level2}}

	data := map[string]interface{}{"type": "motion"}

	result := EvaluateCondition(level1, data)
	if !result {
		t.Error("expected 5-level deep nesting to resolve to true")
	}

	data["type"] = "person"
	result = EvaluateCondition(level1, data)
	if result {
		t.Error("expected 5-level deep nesting to resolve to false when leaf fails")
	}
}
