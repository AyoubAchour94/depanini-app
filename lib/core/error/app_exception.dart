/// Base type for known, app-level failures.
///
/// Throwing/handling a typed exception (instead of raw `Object`) lets the UI
/// present meaningful messages and lets us attach the original error + stack
/// for logging. Extend this for feature-specific failures in later phases.
class AppException implements Exception {
  const AppException(
    this.message, {
    this.cause,
    this.stackTrace,
  });

  /// Human-readable, user-safe description of what went wrong.
  final String message;

  /// The underlying error, if this exception wraps another.
  final Object? cause;

  /// Stack trace captured at the failure site, for logging.
  final StackTrace? stackTrace;

  @override
  String toString() =>
      'AppException: $message${cause != null ? ' (cause: $cause)' : ''}';
}
