#!/bin/bash
# Sets up Android emulator and runs B-Logix automatically

ANDROID_HOME="$HOME/Library/Android/sdk"
export ANDROID_HOME
export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"

echo "==> Accepting Android SDK licenses..."
yes | sdkmanager --licenses > /dev/null 2>&1

echo "==> Installing SDK components..."
sdkmanager "platform-tools" "platforms;android-34" "system-images;android-34;google_apis;x86_64" "emulator" 2>&1 | grep -E "(done|Downloading|Installing)"

echo "==> Creating AVD (Pixel 7)..."
echo "no" | avdmanager create avd \
  --name "Pixel7_API34" \
  --package "system-images;android-34;google_apis;x86_64" \
  --device "pixel_7" \
  --force 2>&1

echo "==> Starting emulator in background..."
emulator -avd Pixel7_API34 -no-audio -no-boot-anim -gpu swiftshader_indirect &
EMULATOR_PID=$!

echo "==> Waiting for emulator to boot (this takes ~2 min)..."
adb wait-for-device
while [ "$(adb shell getprop sys.boot_completed 2>/dev/null)" != "1" ]; do
  sleep 3
done

echo "==> Emulator ready! Building and installing B-Logix..."
cd "$(dirname "$0")"
npm run build
npx cap sync android

cd android
./gradlew assembleDebug 2>&1 | grep -E "(BUILD|error:|warning:)"
adb install -r app/build/outputs/apk/debug/app-debug.apk

echo ""
echo "==> B-Logix installed! Launching app on emulator..."
adb shell am start -n do.blogix.app/.MainActivity

echo "==> Done! Check the emulator window."
