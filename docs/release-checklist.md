# Release Checklist

## Pre-Release

- [ ] All features tested on Android emulator (API 36)
- [ ] All features tested on real device (Android 14+)
- [ ] Web viewer tested in Chrome, Firefox, Safari
- [ ] Workflow JSON loading via file picker works
- [ ] Workflow JSON loading via drag-and-drop works
- [ ] Node search / highlight / jump works
- [ ] Markdown links are clickable
- [ ] History panel works
- [ ] Nodes source summary works
- [ ] About panel displays correct version

## Build

- [ ] `./gradlew clean` passes
- [ ] `./gradlew assembleAlpha` passes
- [ ] Alpha APK filename matches `EasyComfyUI-v{version}.apk`
- [ ] APK size is reasonable

## Verify Alpha APK

- [ ] `aapt dump badging` shows correct package/version
- [ ] No `testOnly=true` in merged manifest
- [ ] No `debuggable=true` in merged manifest
- [ ] APK installs via `adb install`
- [ ] APK installs via file manager on real device

## GitHub Release

- [ ] Tag created: `v{version}`
- [ ] Release notes written
- [ ] APK attached to release
- [ ] Screenshots updated
