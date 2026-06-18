// Smoke test: the shared app shell builds for both flavors.
//
// No MAPBOX_ACCESS_TOKEN is defined during tests, so MapTestScreen renders its
// "token missing" placeholder (no network), which keeps this test hermetic.

import 'package:depanini/app.dart';
import 'package:depanini/core/firebase/firebase_initializer.dart';
import 'package:depanini/flavors/flavor.dart';
import 'package:depanini/flavors/flavor_config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  setUp(FlavorConfig.reset);

  testWidgets('user app builds and shows the map test screen', (tester) async {
    FlavorConfig.initialize(Flavor.user);

    await tester.pumpWidget(
      const DepaniniApp(firebaseInit: FirebaseInitResult.success()),
    );

    expect(find.textContaining('Map test'), findsOneWidget);
    expect(find.textContaining('Depanini'), findsWidgets);
  });

  testWidgets('driver app builds and shows the map test screen', (tester) async {
    FlavorConfig.initialize(Flavor.driver);

    await tester.pumpWidget(
      const DepaniniApp(firebaseInit: FirebaseInitResult.success()),
    );

    expect(find.textContaining('Map test'), findsOneWidget);
  });
}
