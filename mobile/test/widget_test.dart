import 'package:flutter_test/flutter_test.dart';
import 'package:onlab_mobile/main.dart';

void main() {
  testWidgets('shows the configured API endpoint', (tester) async {
    await tester.pumpWidget(const OnlabApp());

    expect(find.text('Mobile client'), findsOneWidget);
    expect(find.text('API endpoint'), findsOneWidget);
    expect(find.text('http://localhost:30022'), findsOneWidget);
  });
}
