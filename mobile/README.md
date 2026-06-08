# Onlab Mobile

Flutter client for the Onlab API.

## Prerequisites

Flutter is installed through Homebrew. Check the local toolchain with:

```sh
flutter doctor
```

To run on Android, install Android Studio and let its setup wizard install the
Android SDK and an emulator.

To run on iOS, install Xcode from the App Store, then run:

```sh
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -runFirstLaunch
brew install cocoapods
```

## Run

Start the API from the repository root:

```sh
pnpm --filter api start
```

Then, from this directory:

```sh
flutter run
```

The default API URL is:

- Android emulator: `http://10.0.2.2:30022`
- iOS simulator: `http://localhost:30022`

Override it for a physical device or another environment:

```sh
flutter run --dart-define=API_URL=http://192.168.1.10:30022
```

Use the development machine's LAN address for a physical device. Both devices
must be on the same network, and the API must listen on a reachable interface.

## Verify

```sh
flutter analyze
flutter test
```
