package rules

import (
	"fmt"
	"strings"
)

// EvaluateCondition recursively evaluates a condition tree against the
// provided data map. Group nodes (AND/OR) combine their children's results.
// Leaf nodes compare data[field] against value using the specified operator.
// Returns false for missing fields or unsupported operators.
func EvaluateCondition(node ConditionNode, data map[string]interface{}) bool {
	// Group node: combine children with AND/OR logic.
	if node.Logic != "" {
		return evaluateGroup(node, data)
	}

	// Leaf node: compare field value.
	if node.Field == "" {
		return false
	}

	fieldVal, ok := data[node.Field]
	if !ok {
		return false
	}

	return compareValues(node.Operator, fieldVal, node.Value)
}

func evaluateGroup(node ConditionNode, data map[string]interface{}) bool {
	if len(node.Children) == 0 {
		return false
	}

	switch strings.ToLower(node.Logic) {
	case "and":
		for _, child := range node.Children {
			if !EvaluateCondition(child, data) {
				return false
			}
		}
		return true
	case "or":
		for _, child := range node.Children {
			if EvaluateCondition(child, data) {
				return true
			}
		}
		return false
	default:
		return false
	}
}

func compareValues(operator string, fieldVal, conditionVal interface{}) bool {
	switch operator {
	case "eq":
		return compareEqual(fieldVal, conditionVal)
	case "neq":
		return !compareEqual(fieldVal, conditionVal)
	case "gt":
		return compareNumeric(fieldVal, conditionVal) > 0
	case "gte":
		return compareNumeric(fieldVal, conditionVal) >= 0
	case "lt":
		return compareNumeric(fieldVal, conditionVal) < 0
	case "lte":
		return compareNumeric(fieldVal, conditionVal) <= 0
	case "contains":
		return compareContains(fieldVal, conditionVal)
	case "not_contains":
		return !compareContains(fieldVal, conditionVal)
	case "in":
		return compareIn(fieldVal, conditionVal)
	default:
		return false
	}
}

// compareEqual checks equality with type coercion.
func compareEqual(a, b interface{}) bool {
	return fmt.Sprintf("%v", a) == fmt.Sprintf("%v", b)
}

// compareNumeric returns -1, 0, or 1 comparing a to b as floats.
// Returns -2 if comparison is not possible (treated as false for all numeric ops).
func compareNumeric(a, b interface{}) int {
	fa, ok := toFloat64(a)
	if !ok {
		return -2
	}
	fb, ok := toFloat64(b)
	if !ok {
		return -2
	}

	switch {
	case fa < fb:
		return -1
	case fa > fb:
		return 1
	default:
		return 0
	}
}

// compareContains checks if the string representation of a contains b.
func compareContains(a, b interface{}) bool {
	sa := fmt.Sprintf("%v", a)
	sb := fmt.Sprintf("%v", b)
	return strings.Contains(sa, sb)
}

// compareIn checks if the field value is contained in the condition value
// (expected to be a slice).
func compareIn(fieldVal, conditionVal interface{}) bool {
	slice, ok := toStringSlice(conditionVal)
	if !ok {
		return false
	}

	fieldStr := fmt.Sprintf("%v", fieldVal)
	for _, item := range slice {
		if item == fieldStr {
			return true
		}
	}
	return false
}

// toFloat64 converts a value to float64.
func toFloat64(v interface{}) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int32:
		return float64(n), true
	case int64:
		return float64(n), true
	case json_number:
		f, err := n.Float64()
		return f, err == nil
	default:
		return 0, false
	}
}

// json_number is an interface matching json.Number's Float64 method.
type json_number interface {
	Float64() (float64, error)
}

// toStringSlice converts an interface to a string slice.
func toStringSlice(v interface{}) ([]string, bool) {
	switch s := v.(type) {
	case []string:
		return s, true
	case []interface{}:
		result := make([]string, 0, len(s))
		for _, item := range s {
			result = append(result, fmt.Sprintf("%v", item))
		}
		return result, true
	default:
		return nil, false
	}
}
