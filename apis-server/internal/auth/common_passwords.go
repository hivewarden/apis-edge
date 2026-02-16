// Package auth provides authentication utilities for the APIS server.
package auth

import (
	_ "embed"
	"strings"
	"sync"
)

// commonPasswordsData contains the embedded common passwords list.
// This list contains approximately 1000 of the most commonly used passwords.
// Source: Compiled from SecLists and common breach databases.
//
//go:embed common_passwords.txt
var commonPasswordsData string

// commonPasswords is a set of common passwords for O(1) lookup.
// Keys are lowercase for case-insensitive comparison.
var commonPasswords map[string]struct{}
var commonPasswordsOnce sync.Once

// initCommonPasswords initializes the common passwords map from the embedded data.
// It is called lazily on first use via sync.Once to avoid startup overhead
// if the feature is not used.
func initCommonPasswords() {
	commonPasswordsOnce.Do(func() {
		lines := strings.Split(commonPasswordsData, "\n")
		commonPasswords = make(map[string]struct{}, len(lines))
		for _, line := range lines {
			pw := strings.TrimSpace(strings.ToLower(line))
			if pw != "" {
				commonPasswords[pw] = struct{}{}
			}
		}
	})
}

// IsCommonPassword checks if the given password is in the common passwords list.
// The check is case-insensitive: "Password123" and "password123" are treated equally.
//
// Returns true if the password is common and should be rejected.
//
// Example:
//
//	if IsCommonPassword("password123") {
//	    return ErrCommonPassword
//	}
func IsCommonPassword(password string) bool {
	initCommonPasswords()
	_, exists := commonPasswords[strings.ToLower(password)]
	return exists
}

// CommonPasswordCount returns the number of passwords in the common passwords list.
// This is primarily useful for testing and informational purposes.
func CommonPasswordCount() int {
	initCommonPasswords()
	return len(commonPasswords)
}
