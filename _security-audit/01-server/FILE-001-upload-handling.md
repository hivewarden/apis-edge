# FILE-001: File Upload and Handling Security Audit

**Severity:** MEDIUM (with one HIGH finding)
**OWASP Category:** A03:2021 - Injection, A01:2021 - Broken Access Control
**Auditor:** Security Audit
**Date:** 2026-01-31

---

## Executive Summary

The APIS server handles file uploads in three primary handlers:
1. **Clip uploads** (`/api/units/clips`) - Video files from edge devices
2. **Transcription** (`/api/transcribe`) - Audio files for speech-to-text
3. **Milestone photos** (`/api/milestones/photos`) - Image uploads

The codebase demonstrates **good security practices** in several areas including path traversal validation, content-type sniffing, and file size limits. However, several vulnerabilities were identified that require remediation.

---

## Finding 1: Command Injection via Filename in Transcription Handler

**Severity:** HIGH
**OWASP Category:** A03:2021 - Injection
**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/transcribe.go`
**Lines:** 100-106, 287-294

### Vulnerable Code

```go
// Line 100-106
ext := filepath.Ext(header.Filename)
if ext == "" {
    ext = ".webm"
}
tempFile, err := os.CreateTemp("", "transcribe-*"+ext)

// Lines 287-294 - OpenAI mode
cmd := exec.Command("curl",
    "-s", // Silent
    "https://api.openai.com/v1/audio/transcriptions",
    "-H", "Authorization: Bearer "+apiKey,
    "-F", "file=@"+audioPath,  // audioPath contains user-controlled extension
    "-F", "model=whisper-1",
    "-F", "response_format=text",
)
```

### Attack Vector

1. An attacker uploads a file with a malicious filename extension
2. The extension is extracted using `filepath.Ext()` without sanitization
3. The extension is used directly in temp file creation
4. While `os.CreateTemp` is relatively safe, the filename could contain special characters that cause issues in downstream processing (ffmpeg, curl)

**Example malicious filenames:**
- `test.webm; rm -rf /` - Shell injection attempt
- `test$(whoami).webm` - Command substitution
- `test|cat /etc/passwd.webm` - Pipe injection

### Impact

- Command injection in ffmpeg or curl execution paths
- Potential arbitrary file read/write
- Denial of service through malformed filenames

### Remediation

```go
// Sanitize filename extension - only allow known safe extensions
var allowedAudioExtensions = map[string]bool{
    ".webm": true,
    ".wav":  true,
    ".mp3":  true,
    ".ogg":  true,
    ".m4a":  true,
    ".mp4":  true,
}

func sanitizeAudioExtension(filename string) string {
    ext := strings.ToLower(filepath.Ext(filename))
    if !allowedAudioExtensions[ext] {
        return ".webm" // Safe default
    }
    // Additional validation - only alphanumeric after the dot
    if !regexp.MustCompile(`^\.[a-z0-9]+$`).MatchString(ext) {
        return ".webm"
    }
    return ext
}
```

### Acceptance Criteria
- [ ] Extension whitelist implemented for audio uploads
- [ ] Regex validation ensures extension contains only alphanumeric characters
- [ ] Unit tests verify malicious extensions are rejected
- [ ] Filenames logged for audit trail (without executing them)

---

## Finding 2: Missing Content Validation for Clip Uploads

**Severity:** MEDIUM
**OWASP Category:** A03:2021 - Injection
**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/clips.go`
**Lines:** 172-177

### Current Implementation

```go
// Line 172-177
// Validate MP4 format
if err := services.ValidateMP4(fileData); err != nil {
    log.Debug().Err(err).Msg("handler: invalid MP4 file")
    respondError(w, "Invalid MP4 file: "+err.Error(), http.StatusBadRequest)
    return
}
```

### Analysis

The `ValidateMP4` function in `clip_storage.go` (lines 58-91) only checks:
1. File size is at least 12 bytes
2. First box type is "ftyp"
3. Brand identifier (but logs warning and accepts unknown brands)

```go
// clip_storage.go lines 60-91
func ValidateMP4(data []byte) error {
    if len(data) < 12 {
        return fmt.Errorf("file too small to be valid MP4")
    }
    boxType := string(data[4:8])
    if boxType != "ftyp" {
        return fmt.Errorf("not a valid MP4 file: missing ftyp box, found %q", boxType)
    }
    // ... brand check logs warning but doesn't reject unknown brands
    return nil
}
```

### Vulnerability

1. **Polyglot files:** A file can be a valid MP4 AND contain malicious content (e.g., MP4 header followed by JavaScript or HTML)
2. **Minimal validation:** Only checks first 12 bytes - rest of file is unchecked
3. **Unknown brands accepted:** Could allow crafted files with valid ftyp but malicious payloads

### Impact

- Stored XSS if clips are served without proper Content-Type
- Potential for polyglot attacks
- Malware storage/distribution

### Remediation

```go
// Enhanced MP4 validation
func ValidateMP4Enhanced(data []byte) error {
    if len(data) < 12 {
        return fmt.Errorf("file too small to be valid MP4")
    }

    // Check ftyp box
    boxType := string(data[4:8])
    if boxType != "ftyp" {
        return fmt.Errorf("not a valid MP4 file: missing ftyp box")
    }

    // Validate brand is in allowlist
    brand := string(data[8:12])
    allowedBrands := map[string]bool{
        "isom": true, "mp41": true, "mp42": true,
        "avc1": true, "M4V ": true, "mp71": true,
    }
    if !allowedBrands[brand] && !strings.HasPrefix(brand, "iso") {
        return fmt.Errorf("unsupported MP4 brand: %q", brand)
    }

    // Scan for suspicious content patterns
    // (HTML/JS signatures that shouldn't appear in valid MP4)
    suspiciousPatterns := [][]byte{
        []byte("<script"),
        []byte("javascript:"),
        []byte("<?php"),
        []byte("<%"),
    }
    lowerData := bytes.ToLower(data)
    for _, pattern := range suspiciousPatterns {
        if bytes.Contains(lowerData, pattern) {
            return fmt.Errorf("suspicious content detected in MP4 file")
        }
    }

    return nil
}
```

### Acceptance Criteria
- [ ] Brand whitelist strictly enforced (not just logged)
- [ ] Polyglot detection implemented (scan for HTML/JS/PHP signatures)
- [ ] Content-Type header always set to `video/mp4` on serving (already done - good)
- [ ] X-Content-Type-Options: nosniff header added

---

## Finding 3: Path Traversal Protection - Partial Coverage

**Severity:** MEDIUM
**OWASP Category:** A01:2021 - Broken Access Control
**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/clips.go`
**Lines:** 67-80

### Current Implementation (GOOD)

```go
// Line 67-80 - This is properly implemented
func ValidateFilePath(filePath string, basePath string) bool {
    cleanPath := filepath.Clean(filePath)
    cleanBase := filepath.Clean(basePath)
    return strings.HasPrefix(cleanPath, cleanBase+string(filepath.Separator)) || cleanPath == cleanBase
}
```

### Analysis

The path traversal protection in clips.go is **correctly implemented**. However:

1. **Milestone photos** handler does NOT use the same validation
2. **Transcription** handler creates temp files without path validation

### Vulnerable Code - Milestones Handler

```go
// milestones.go lines 301-311
// Delete files from disk
basePath := getMilestoneStoragePath()
// Convert relative path back to absolute
filePath := strings.Replace(photo.FilePath, "/clips/", basePath+"/", 1)
if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
    log.Warn().Err(err).Str("path", filePath).Msg("Failed to delete milestone photo file")
}
```

The `FilePath` comes from the database, which was originally from user-controlled storage. While unlikely to be exploited (path set during upload), this pattern is risky.

### Remediation

```go
// Apply ValidateFilePath to ALL file serving/deletion operations
// In milestones.go deletion:
func DeleteMilestonePhoto(w http.ResponseWriter, r *http.Request) {
    // ... existing code ...

    basePath := getMilestoneStoragePath()
    filePath := strings.Replace(photo.FilePath, "/clips/", basePath+"/", 1)

    // ADD: Validate path before deletion
    if !handlers.ValidateFilePath(filePath, basePath) {
        log.Warn().
            Str("photo_id", photoID).
            Str("file_path", filePath).
            Msg("handler: suspicious file path detected in milestone photo deletion")
        // Continue to delete DB record, but skip file deletion
    } else {
        if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
            log.Warn().Err(err).Str("path", filePath).Msg("Failed to delete milestone photo file")
        }
    }
}
```

### Acceptance Criteria
- [ ] `ValidateFilePath` applied to milestone photo serving/deletion
- [ ] Path validation added to any new file handlers
- [ ] Unit tests verify path traversal is blocked across all handlers

---

## Finding 4: Temporary File Cleanup Race Condition

**Severity:** LOW
**OWASP Category:** A05:2021 - Security Misconfiguration
**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/transcribe.go`
**Lines:** 114-118, 224-225

### Vulnerable Code

```go
// Line 114-118
cleanupTempFile := func() {
    os.Remove(tempPath)
}
defer cleanupTempFile()

// Line 224-225
wavPath := audioPath + ".wav"
defer os.Remove(wavPath)
```

### Analysis

1. If the server crashes between file creation and cleanup, temp files persist
2. Multiple conversion files created (original + .wav)
3. No periodic cleanup of orphaned temp files
4. Temp files created in system temp directory may be world-readable

### Impact

- Disk space exhaustion from accumulated temp files
- Potential information disclosure of audio content
- DoS through temp file accumulation

### Remediation

```go
// 1. Use a dedicated temp directory with restricted permissions
func getSecureTempDir() string {
    tempDir := filepath.Join(os.TempDir(), "apis-transcribe")
    os.MkdirAll(tempDir, 0700) // Only owner can read/write
    return tempDir
}

// 2. Create temp file in secure location
tempFile, err := os.CreateTemp(getSecureTempDir(), "transcribe-*"+ext)

// 3. Implement periodic cleanup (in main.go or separate goroutine)
func cleanupOrphanedTempFiles() {
    tempDir := getSecureTempDir()
    entries, _ := os.ReadDir(tempDir)
    cutoff := time.Now().Add(-1 * time.Hour)

    for _, entry := range entries {
        info, _ := entry.Info()
        if info.ModTime().Before(cutoff) {
            os.Remove(filepath.Join(tempDir, entry.Name()))
        }
    }
}
```

### Acceptance Criteria
- [ ] Dedicated temp directory created with 0700 permissions
- [ ] Periodic cleanup of temp files older than 1 hour
- [ ] Temp file cleanup on server shutdown (graceful shutdown handler)

---

## Finding 5: Milestone Photo Extension from Content Sniffing

**Severity:** LOW
**OWASP Category:** A03:2021 - Injection
**File:** `/Users/jermodelaruelle/Projects/apis/apis-server/internal/handlers/milestones.go`
**Lines:** 111-124

### Current Implementation (GOOD)

```go
// Lines 111-124 - Content sniffing is properly implemented
sniffBuffer := make([]byte, 512)
n, err := file.Read(sniffBuffer)
if err != nil && err != io.EOF {
    respondError(w, "Failed to read file", http.StatusBadRequest)
    return
}
detectedType := http.DetectContentType(sniffBuffer[:n])
ext, ok := allowedImageTypes[detectedType]
if !ok {
    respondError(w, "Invalid file type. Only JPEG, PNG, and WebP images are allowed", http.StatusBadRequest)
    return
}
```

### Analysis

This is **correctly implemented**:
- Uses `http.DetectContentType` to sniff actual content
- Does NOT trust Content-Type header from client
- Whitelist of allowed types
- Extension derived from detected type, not filename

**No remediation needed** - this is a positive finding demonstrating good security practice.

---

## Finding 6: Missing X-Content-Type-Options Header

**Severity:** LOW
**OWASP Category:** A05:2021 - Security Misconfiguration
**Files:** All handlers serving files

### Analysis

When serving video clips and thumbnails, the handlers set `Content-Type` but do not set `X-Content-Type-Options: nosniff`. This header prevents browsers from MIME-sniffing the response away from the declared content-type.

### Current Code

```go
// clips.go line 479
w.Header().Set("Content-Type", "image/jpeg")

// clips.go line 623
w.Header().Set("Content-Type", "video/mp4")
```

### Remediation

Add security headers to all file serving responses:

```go
// In all file serving handlers
w.Header().Set("Content-Type", "video/mp4")
w.Header().Set("X-Content-Type-Options", "nosniff")
w.Header().Set("Content-Security-Policy", "default-src 'none'")
```

Or better, implement as middleware for all `/api/clips/*/video` and `/api/clips/*/thumbnail` routes.

### Acceptance Criteria
- [ ] X-Content-Type-Options: nosniff added to all file responses
- [ ] Content-Security-Policy header added for served files
- [ ] Middleware approach preferred for consistency

---

## Finding 7: No Zip/Archive Processing Vulnerabilities

**Severity:** N/A (No vulnerability)
**Status:** Not Applicable

The codebase does not process ZIP files or archives. No zip-slip vulnerabilities exist.

---

## Summary Table

| Finding | Severity | Status | Priority |
|---------|----------|--------|----------|
| FILE-001-1: Command Injection via Filename | HIGH | Open | P1 |
| FILE-001-2: Missing Content Validation | MEDIUM | Open | P2 |
| FILE-001-3: Path Traversal - Partial Coverage | MEDIUM | Open | P2 |
| FILE-001-4: Temp File Cleanup Race | LOW | Open | P3 |
| FILE-001-5: Content Sniffing | N/A | Good Practice | N/A |
| FILE-001-6: Missing Security Headers | LOW | Open | P3 |
| FILE-001-7: Zip Slip | N/A | Not Applicable | N/A |

---

## Positive Security Observations

1. **Path Traversal Protection**: The `ValidateFilePath` function in clips.go is correctly implemented and prevents directory traversal attacks.

2. **Content-Type Sniffing**: Milestone photo uploads correctly use `http.DetectContentType` rather than trusting client-provided headers.

3. **File Size Limits**: All upload handlers enforce maximum file sizes (10MB for clips/audio, 5MB for photos).

4. **MP4 Magic Byte Validation**: The `ValidateMP4` function checks for valid ftyp box headers.

5. **Multipart Cleanup**: The clip upload handler correctly calls `r.MultipartForm.RemoveAll()` in a defer block.

6. **Tenant Isolation**: File paths include tenant ID, preventing cross-tenant file access.

7. **Soft Delete**: Clips use soft deletion with 30-day retention before permanent removal.

8. **RLS Integration**: Database queries rely on Row Level Security for tenant isolation.

---

## Recommended Priority Order

1. **P1 - Immediate**: Fix command injection via filename (Finding 1)
2. **P2 - This Sprint**: Enhance MP4 validation and apply path validation consistently
3. **P3 - Backlog**: Implement temp file cleanup and add security headers
