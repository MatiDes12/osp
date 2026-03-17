package rules

import "testing"

func TestEvaluateCondition(t *testing.T) {
	tests := []struct {
		name     string
		node     ConditionNode
		data     map[string]interface{}
		expected bool
	}{
		{
			name: "simple equality - match",
			node: ConditionNode{Field: "type", Operator: "eq", Value: "motion"},
			data: map[string]interface{}{"type": "motion"},
			expected: true,
		},
		{
			name: "simple equality - no match",
			node: ConditionNode{Field: "type", Operator: "eq", Value: "person"},
			data: map[string]interface{}{"type": "motion"},
			expected: false,
		},
		{
			name: "not equal - match",
			node: ConditionNode{Field: "type", Operator: "neq", Value: "person"},
			data: map[string]interface{}{"type": "motion"},
			expected: true,
		},
		{
			name: "numeric gt - match",
			node: ConditionNode{Field: "intensity", Operator: "gt", Value: float64(0.5)},
			data: map[string]interface{}{"intensity": float64(0.8)},
			expected: true,
		},
		{
			name: "numeric gt - no match",
			node: ConditionNode{Field: "intensity", Operator: "gt", Value: float64(0.9)},
			data: map[string]interface{}{"intensity": float64(0.8)},
			expected: false,
		},
		{
			name: "numeric gte - exact match",
			node: ConditionNode{Field: "intensity", Operator: "gte", Value: float64(0.8)},
			data: map[string]interface{}{"intensity": float64(0.8)},
			expected: true,
		},
		{
			name: "numeric lt - match",
			node: ConditionNode{Field: "intensity", Operator: "lt", Value: float64(0.5)},
			data: map[string]interface{}{"intensity": float64(0.3)},
			expected: true,
		},
		{
			name: "numeric lte - exact match",
			node: ConditionNode{Field: "intensity", Operator: "lte", Value: float64(0.5)},
			data: map[string]interface{}{"intensity": float64(0.5)},
			expected: true,
		},
		{
			name: "string contains - match",
			node: ConditionNode{Field: "name", Operator: "contains", Value: "front"},
			data: map[string]interface{}{"name": "front door camera"},
			expected: true,
		},
		{
			name: "string contains - no match",
			node: ConditionNode{Field: "name", Operator: "contains", Value: "back"},
			data: map[string]interface{}{"name": "front door camera"},
			expected: false,
		},
		{
			name: "string not_contains - match",
			node: ConditionNode{Field: "name", Operator: "not_contains", Value: "back"},
			data: map[string]interface{}{"name": "front door camera"},
			expected: true,
		},
		{
			name: "in operator - match",
			node: ConditionNode{Field: "severity", Operator: "in", Value: []interface{}{"high", "critical"}},
			data: map[string]interface{}{"severity": "high"},
			expected: true,
		},
		{
			name: "in operator - no match",
			node: ConditionNode{Field: "severity", Operator: "in", Value: []interface{}{"high", "critical"}},
			data: map[string]interface{}{"severity": "low"},
			expected: false,
		},
		{
			name: "nested AND - all match",
			node: ConditionNode{
				Logic: "and",
				Children: []ConditionNode{
					{Field: "type", Operator: "eq", Value: "motion"},
					{Field: "intensity", Operator: "gt", Value: float64(0.5)},
				},
			},
			data: map[string]interface{}{"type": "motion", "intensity": float64(0.8)},
			expected: true,
		},
		{
			name: "nested AND - one fails",
			node: ConditionNode{
				Logic: "and",
				Children: []ConditionNode{
					{Field: "type", Operator: "eq", Value: "motion"},
					{Field: "intensity", Operator: "gt", Value: float64(0.9)},
				},
			},
			data: map[string]interface{}{"type": "motion", "intensity": float64(0.8)},
			expected: false,
		},
		{
			name: "nested OR - one matches",
			node: ConditionNode{
				Logic: "or",
				Children: []ConditionNode{
					{Field: "type", Operator: "eq", Value: "person"},
					{Field: "type", Operator: "eq", Value: "motion"},
				},
			},
			data: map[string]interface{}{"type": "motion"},
			expected: true,
		},
		{
			name: "nested OR - none match",
			node: ConditionNode{
				Logic: "or",
				Children: []ConditionNode{
					{Field: "type", Operator: "eq", Value: "person"},
					{Field: "type", Operator: "eq", Value: "vehicle"},
				},
			},
			data: map[string]interface{}{"type": "motion"},
			expected: false,
		},
		{
			name: "mixed AND/OR nesting",
			node: ConditionNode{
				Logic: "and",
				Children: []ConditionNode{
					{Field: "intensity", Operator: "gte", Value: float64(0.5)},
					{
						Logic: "or",
						Children: []ConditionNode{
							{Field: "type", Operator: "eq", Value: "person"},
							{Field: "type", Operator: "eq", Value: "vehicle"},
						},
					},
				},
			},
			data: map[string]interface{}{"type": "person", "intensity": float64(0.7)},
			expected: true,
		},
		{
			name: "mixed AND/OR nesting - inner OR fails",
			node: ConditionNode{
				Logic: "and",
				Children: []ConditionNode{
					{Field: "intensity", Operator: "gte", Value: float64(0.5)},
					{
						Logic: "or",
						Children: []ConditionNode{
							{Field: "type", Operator: "eq", Value: "person"},
							{Field: "type", Operator: "eq", Value: "vehicle"},
						},
					},
				},
			},
			data: map[string]interface{}{"type": "motion", "intensity": float64(0.7)},
			expected: false,
		},
		{
			name: "missing field returns false",
			node: ConditionNode{Field: "nonexistent", Operator: "eq", Value: "anything"},
			data: map[string]interface{}{"type": "motion"},
			expected: false,
		},
		{
			name: "empty children in AND returns false",
			node: ConditionNode{Logic: "and", Children: []ConditionNode{}},
			data: map[string]interface{}{"type": "motion"},
			expected: false,
		},
		{
			name: "empty children in OR returns false",
			node: ConditionNode{Logic: "or", Children: []ConditionNode{}},
			data: map[string]interface{}{"type": "motion"},
			expected: false,
		},
		{
			name: "empty node returns false",
			node: ConditionNode{},
			data: map[string]interface{}{"type": "motion"},
			expected: false,
		},
		{
			name: "numeric equality with int",
			node: ConditionNode{Field: "count", Operator: "eq", Value: 5},
			data: map[string]interface{}{"count": 5},
			expected: true,
		},
		{
			name: "boolean equality",
			node: ConditionNode{Field: "active", Operator: "eq", Value: true},
			data: map[string]interface{}{"active": true},
			expected: true,
		},
		{
			name: "in operator with string slice",
			node: ConditionNode{Field: "zone", Operator: "in", Value: []string{"front", "back"}},
			data: map[string]interface{}{"zone": "front"},
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
