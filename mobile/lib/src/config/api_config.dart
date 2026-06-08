import 'dart:io';

abstract final class ApiConfig {
  static const _configuredBaseUrl = String.fromEnvironment('API_URL');

  static String get baseUrl {
    if (_configuredBaseUrl.isNotEmpty) {
      return _configuredBaseUrl;
    }

    // Android emulators expose the host machine through this special address.
    if (Platform.isAndroid) {
      return 'http://10.0.2.2:30022';
    }

    return 'http://localhost:30022';
  }
}
