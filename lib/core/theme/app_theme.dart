import 'package:flutter/material.dart';

/// Central Material 3 theme. Each flavor passes its own [seedColor]
/// (see `FlavorConfig.brandColor`) so the user and driver apps look distinct
/// while sharing one theme definition.
class AppTheme {
  const AppTheme._();

  static ThemeData light(Color seedColor) {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: seedColor,
        brightness: Brightness.light,
      ),
    );
  }

  static ThemeData dark(Color seedColor) {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: seedColor,
        brightness: Brightness.dark,
      ),
    );
  }
}
