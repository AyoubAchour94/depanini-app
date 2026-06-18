import 'package:depanini/flavors/flavor.dart';
import 'package:depanini/flavors/flavor_config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  setUp(FlavorConfig.reset);

  group('FlavorConfig', () {
    test('user flavor has correct identity', () {
      final config = FlavorConfig.initialize(Flavor.user);
      expect(config.appName, 'Depanini');
      expect(config.bundleId, 'com.depanini.app');
      expect(config.isUserApp, isTrue);
      expect(config.isDriverApp, isFalse);
      expect(config.features.isDriverApp, isFalse);
    });

    test('driver flavor has correct identity', () {
      final config = FlavorConfig.initialize(Flavor.driver);
      expect(config.appName, 'Depanini Driver');
      expect(config.bundleId, 'com.depanini.driver');
      expect(config.isDriverApp, isTrue);
      expect(config.isUserApp, isFalse);
      expect(config.features.isDriverApp, isTrue);
    });

    test('instance reflects the last initialized flavor', () {
      FlavorConfig.initialize(Flavor.driver);
      expect(FlavorConfig.instance.flavor, Flavor.driver);
      expect(FlavorConfig.isInitialized, isTrue);
    });
  });
}
