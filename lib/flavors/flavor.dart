/// The two build flavors of Depanini.
///
/// Both flavors are built from this single codebase but ship as two separate
/// apps (different bundle IDs, Firebase configs, and home/navigation flows).
enum Flavor {
  /// The customer-facing app ("Depanini", com.depanini.app).
  user,

  /// The tow-truck driver app ("Depanini Driver", com.depanini.driver).
  driver,
}
