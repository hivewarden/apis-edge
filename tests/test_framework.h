/**
 * APIS Edge Test Framework
 *
 * Lightweight test infrastructure for embedded C testing.
 * Designed to be compatible with existing test patterns while adding:
 * - Consistent assertion macros with file/line reporting
 * - Test registration and counting
 * - Color output for terminal
 * - Float comparison with epsilon
 * - Setup/teardown support
 * - Summary reporting with exit codes for CTest
 *
 * Usage:
 *   #include "test_framework.h"
 *
 *   void test_something(void) {
 *       ASSERT_TRUE(1 == 1, "basic truth");
 *       ASSERT_EQ(42, 42, "meaning of life");
 *   }
 *
 *   int main(void) {
 *       TEST_BEGIN("my_module");
 *       RUN_TEST(test_something);
 *       TEST_END();
 *   }
 */

#ifndef APIS_TEST_FRAMEWORK_H
#define APIS_TEST_FRAMEWORK_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

/* ── Color output (disable with NO_COLOR env or -DNO_COLOR) ── */
#if defined(NO_COLOR)
  #define TF_RED     ""
  #define TF_GREEN   ""
  #define TF_YELLOW  ""
  #define TF_RESET   ""
  #define TF_BOLD    ""
#else
  #define TF_RED     "\033[31m"
  #define TF_GREEN   "\033[32m"
  #define TF_YELLOW  "\033[33m"
  #define TF_RESET   "\033[0m"
  #define TF_BOLD    "\033[1m"
#endif

/* ── Test state (file-scoped) ── */
static int tf_tests_run = 0;
static int tf_tests_passed = 0;
static int tf_tests_failed = 0;
static int tf_current_test_failed = 0;
static const char *tf_suite_name = "unknown";

/* ── Setup/Teardown hooks (optional, define before TEST_BEGIN) ── */
#ifndef TEST_SETUP
  #define TEST_SETUP()    ((void)0)
#endif
#ifndef TEST_TEARDOWN
  #define TEST_TEARDOWN() ((void)0)
#endif

/* ── Test lifecycle ── */

#define TEST_BEGIN(suite) do { \
    tf_suite_name = (suite); \
    printf("\n%s══════════════════════════════════════════%s\n", TF_BOLD, TF_RESET); \
    printf("  %sTest Suite: %s%s\n", TF_BOLD, tf_suite_name, TF_RESET); \
    printf("%s══════════════════════════════════════════%s\n\n", TF_BOLD, TF_RESET); \
} while(0)

#define RUN_TEST(fn) do { \
    tf_current_test_failed = 0; \
    tf_tests_run++; \
    TEST_SETUP(); \
    fn(); \
    TEST_TEARDOWN(); \
    if (tf_current_test_failed) { \
        tf_tests_failed++; \
        printf("  %s✗ %s%s\n", TF_RED, #fn, TF_RESET); \
    } else { \
        tf_tests_passed++; \
        printf("  %s✓ %s%s\n", TF_GREEN, #fn, TF_RESET); \
    } \
} while(0)

#define TEST_END() do { \
    printf("\n%s──────────────────────────────────────────%s\n", TF_BOLD, TF_RESET); \
    printf("  %s: %d run, %s%d passed%s, %s%d failed%s\n", \
        tf_suite_name, tf_tests_run, \
        TF_GREEN, tf_tests_passed, TF_RESET, \
        tf_tests_failed ? TF_RED : TF_GREEN, tf_tests_failed, TF_RESET); \
    printf("%s──────────────────────────────────────────%s\n\n", TF_BOLD, TF_RESET); \
    return tf_tests_failed > 0 ? 1 : 0; \
} while(0)

/* ── Assertion macros ── */

#define ASSERT_TRUE(cond, msg) do { \
    if (!(cond)) { \
        printf("    %sFAIL%s: %s (%s:%d)\n", TF_RED, TF_RESET, (msg), __FILE__, __LINE__); \
        printf("      Expected: true, Got: false\n"); \
        tf_current_test_failed = 1; \
        return; \
    } \
} while(0)

#define ASSERT_FALSE(cond, msg) do { \
    if ((cond)) { \
        printf("    %sFAIL%s: %s (%s:%d)\n", TF_RED, TF_RESET, (msg), __FILE__, __LINE__); \
        printf("      Expected: false, Got: true\n"); \
        tf_current_test_failed = 1; \
        return; \
    } \
} while(0)

#define ASSERT_EQ(expected, actual, msg) do { \
    long long _e = (long long)(expected); \
    long long _a = (long long)(actual); \
    if (_e != _a) { \
        printf("    %sFAIL%s: %s (%s:%d)\n", TF_RED, TF_RESET, (msg), __FILE__, __LINE__); \
        printf("      Expected: %lld, Got: %lld\n", _e, _a); \
        tf_current_test_failed = 1; \
        return; \
    } \
} while(0)

#define ASSERT_NEQ(not_expected, actual, msg) do { \
    long long _ne = (long long)(not_expected); \
    long long _a = (long long)(actual); \
    if (_ne == _a) { \
        printf("    %sFAIL%s: %s (%s:%d)\n", TF_RED, TF_RESET, (msg), __FILE__, __LINE__); \
        printf("      Expected NOT: %lld, Got: %lld\n", _ne, _a); \
        tf_current_test_failed = 1; \
        return; \
    } \
} while(0)

#define ASSERT_NULL(ptr, msg) do { \
    if ((ptr) != NULL) { \
        printf("    %sFAIL%s: %s (%s:%d)\n", TF_RED, TF_RESET, (msg), __FILE__, __LINE__); \
        printf("      Expected: NULL, Got: %p\n", (void*)(ptr)); \
        tf_current_test_failed = 1; \
        return; \
    } \
} while(0)

#define ASSERT_NOT_NULL(ptr, msg) do { \
    if ((ptr) == NULL) { \
        printf("    %sFAIL%s: %s (%s:%d)\n", TF_RED, TF_RESET, (msg), __FILE__, __LINE__); \
        printf("      Expected: non-NULL, Got: NULL\n"); \
        tf_current_test_failed = 1; \
        return; \
    } \
} while(0)

#define ASSERT_STR_EQ(expected, actual, msg) do { \
    const char *_e = (expected); \
    const char *_a = (actual); \
    if (_e == NULL || _a == NULL || strcmp(_e, _a) != 0) { \
        printf("    %sFAIL%s: %s (%s:%d)\n", TF_RED, TF_RESET, (msg), __FILE__, __LINE__); \
        printf("      Expected: \"%s\", Got: \"%s\"\n", _e ? _e : "(null)", _a ? _a : "(null)"); \
        tf_current_test_failed = 1; \
        return; \
    } \
} while(0)

#define ASSERT_FLOAT_EQ(expected, actual, epsilon, msg) do { \
    double _e = (double)(expected); \
    double _a = (double)(actual); \
    double _eps = (double)(epsilon); \
    if (fabs(_e - _a) > _eps) { \
        printf("    %sFAIL%s: %s (%s:%d)\n", TF_RED, TF_RESET, (msg), __FILE__, __LINE__); \
        printf("      Expected: %.6f (±%.6f), Got: %.6f\n", _e, _eps, _a); \
        tf_current_test_failed = 1; \
        return; \
    } \
} while(0)

#define ASSERT_GT(val, threshold, msg) do { \
    double _v = (double)(val); \
    double _t = (double)(threshold); \
    if (_v <= _t) { \
        printf("    %sFAIL%s: %s (%s:%d)\n", TF_RED, TF_RESET, (msg), __FILE__, __LINE__); \
        printf("      Expected: > %.6f, Got: %.6f\n", _t, _v); \
        tf_current_test_failed = 1; \
        return; \
    } \
} while(0)

#define ASSERT_LT(val, threshold, msg) do { \
    double _v = (double)(val); \
    double _t = (double)(threshold); \
    if (_v >= _t) { \
        printf("    %sFAIL%s: %s (%s:%d)\n", TF_RED, TF_RESET, (msg), __FILE__, __LINE__); \
        printf("      Expected: < %.6f, Got: %.6f\n", _t, _v); \
        tf_current_test_failed = 1; \
        return; \
    } \
} while(0)

/* ── Convenience: SKIP a test with reason ── */
#define SKIP_TEST(reason) do { \
    printf("    %sSKIP%s: %s\n", TF_YELLOW, TF_RESET, (reason)); \
    return; \
} while(0)

#endif /* APIS_TEST_FRAMEWORK_H */
