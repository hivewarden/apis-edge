// Package beebrain provides the rule engine configuration and loading for BeeBrain AI insights.
package beebrain

import (
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"gopkg.in/yaml.v3"
)

// Rule represents a single analysis rule from the configuration.
type Rule struct {
	ID              string        `yaml:"id"`
	Name            string        `yaml:"name"`
	Description     string        `yaml:"description"`
	Condition       RuleCondition `yaml:"condition"`
	Severity        string        `yaml:"severity"`
	MessageTemplate string        `yaml:"message_template"`
	SuggestedAction string        `yaml:"suggested_action"`
}

// RuleCondition defines how to evaluate the rule.
type RuleCondition struct {
	Type   string                 `yaml:"type"`
	Params map[string]interface{} `yaml:"params"`
}

// RulesConfig represents the top-level rules configuration file.
type RulesConfig struct {
	Rules []Rule `yaml:"rules"`
}

// RulesLoader handles loading and hot-reloading of rules from YAML configuration.
type RulesLoader struct {
	rulesPath  string
	rules      []Rule
	lastLoaded time.Time
	modTime    time.Time
	mu         sync.RWMutex
}

// NewRulesLoader creates a new rules loader for the given configuration file path.
func NewRulesLoader(rulesPath string) (*RulesLoader, error) {
	loader := &RulesLoader{
		rulesPath: rulesPath,
	}

	// Initial load
	if err := loader.reload(); err != nil {
		return nil, fmt.Errorf("beebrain: failed to load initial rules: %w", err)
	}

	log.Info().
		Str("path", rulesPath).
		Int("rule_count", len(loader.rules)).
		Msg("BeeBrain rules loaded")

	return loader, nil
}

// GetRules returns the current rules, checking for file modifications and reloading if needed.
// This enables hot-reload: when the rules.yaml file is modified, changes take effect
// on the next analysis run without requiring a server restart.
func (l *RulesLoader) GetRules() []Rule {
	l.mu.RLock()

	// Check if file has been modified since last load
	stat, err := os.Stat(l.rulesPath)
	if err != nil {
		// Can't stat file, return cached rules
		rules := make([]Rule, len(l.rules))
		copy(rules, l.rules)
		l.mu.RUnlock()
		return rules
	}

	if stat.ModTime().After(l.modTime) {
		// File has been modified, need to reload
		l.mu.RUnlock()
		l.mu.Lock()
		// Re-stat the file after acquiring write lock to avoid race condition
		// (the original stat may be stale if another goroutine reloaded)
		newStat, err := os.Stat(l.rulesPath)
		if err == nil && newStat.ModTime().After(l.modTime) {
			if err := l.reloadLocked(); err != nil {
				log.Warn().Err(err).Msg("beebrain: failed to reload rules, using cached")
			}
		}
		l.mu.Unlock()
		l.mu.RLock()
	}

	rules := make([]Rule, len(l.rules))
	copy(rules, l.rules)
	l.mu.RUnlock()
	return rules
}

// reload loads the rules from the YAML file.
func (l *RulesLoader) reload() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.reloadLocked()
}

// reloadLocked loads the rules without acquiring the lock (caller must hold write lock).
func (l *RulesLoader) reloadLocked() error {
	data, err := os.ReadFile(l.rulesPath)
	if err != nil {
		return fmt.Errorf("failed to read rules file: %w", err)
	}

	var config RulesConfig
	if err := yaml.Unmarshal(data, &config); err != nil {
		return fmt.Errorf("failed to parse rules YAML: %w", err)
	}

	// Validate rules
	for i, rule := range config.Rules {
		if rule.ID == "" {
			return fmt.Errorf("rule at index %d missing id", i)
		}
		if rule.Condition.Type == "" {
			return fmt.Errorf("rule %s missing condition type", rule.ID)
		}
		if rule.Severity == "" {
			return fmt.Errorf("rule %s missing severity", rule.ID)
		}
		if !isValidSeverity(rule.Severity) {
			return fmt.Errorf("rule %s has invalid severity: %s", rule.ID, rule.Severity)
		}
	}

	// Get file modification time
	stat, err := os.Stat(l.rulesPath)
	if err != nil {
		return fmt.Errorf("failed to stat rules file: %w", err)
	}

	l.rules = config.Rules
	l.modTime = stat.ModTime()
	l.lastLoaded = time.Now()

	log.Info().
		Str("path", l.rulesPath).
		Int("rule_count", len(l.rules)).
		Time("mod_time", l.modTime).
		Msg("BeeBrain rules reloaded")

	return nil
}

// isValidSeverity checks if a severity value is valid.
func isValidSeverity(severity string) bool {
	switch severity {
	case "info", "warning", "action-needed":
		return true
	default:
		return false
	}
}

// GetParam retrieves a parameter from the rule condition as a specific type.
// Returns the zero value and false if the parameter doesn't exist or has wrong type.
func (c *RuleCondition) GetParamInt(name string) (int, bool) {
	v, ok := c.Params[name]
	if !ok {
		return 0, false
	}
	switch val := v.(type) {
	case int:
		return val, true
	case float64:
		return int(val), true
	default:
		return 0, false
	}
}

// GetParamFloat retrieves a float parameter from the rule condition.
func (c *RuleCondition) GetParamFloat(name string) (float64, bool) {
	v, ok := c.Params[name]
	if !ok {
		return 0, false
	}
	switch val := v.(type) {
	case float64:
		return val, true
	case int:
		return float64(val), true
	default:
		return 0, false
	}
}

// GetParamString retrieves a string parameter from the rule condition.
func (c *RuleCondition) GetParamString(name string) (string, bool) {
	v, ok := c.Params[name]
	if !ok {
		return "", false
	}
	str, ok := v.(string)
	return str, ok
}
