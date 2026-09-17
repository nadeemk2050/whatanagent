# AssignTask Kotlin Cloud Setup (Unified WhatAnAgent Firebase Project)

This repository now contains a cloud-ready Android Kotlin app scaffold at:
- `android-kotlin/`

Firebase project:
- `whatanagent-a1e59` (same project as the WhatAnAgent dashboard and the assignTask web app)

## 1) Android App registration (DONE)

The Android app is already registered in the project:
- Display name: `assignTask Android`
- Package name: `com.assigntask.app`
- App ID: `1:410197132578:android:a215fc3907e255c8df917b`

`google-services.json` is NOT required - the app initializes Firebase programmatically in
`android-kotlin/app/src/main/java/com/assigntask/app/AssignTaskApplication.kt`.

If the generated config is ever needed:
```bash
firebase apps:sdkconfig ANDROID 1:410197132578:android:a215fc3907e255c8df917b --project whatanagent-a1e59
```

## 2) Use only GitHub cloud (no local Android install)

1. Open this repo in GitHub Codespaces.
2. Codespace loads `.devcontainer/` and installs Android SDK + Gradle tools.
3. Build in Codespaces terminal:
   ```bash
   cd android-kotlin
   gradle :app:assembleDebug
   ```
4. APK output:
   `android-kotlin/app/build/outputs/apk/debug/app-debug.apk`

## 3) Configure CI build artifacts in GitHub Actions

The workflow is:
- `.github/workflows/build-android-kotlin.yml`

Optional but recommended:
1. In GitHub repo -> Settings -> Secrets and variables -> Actions.
2. Add secret `GOOGLE_SERVICES_JSON`.
3. Paste full contents of your downloaded `google-services.json`.

On every push to `master`/`main` touching `android-kotlin/**`, Actions builds debug APK and uploads artifact.

## 4) Current app scope

The Kotlin app currently includes:
- Jetpack Compose UI
- Firebase Firestore task list sync
- Add task + toggle done

## 5) Next feature parity steps

1. Match all web features from your existing app.
2. Add notifications using WorkManager + Firebase Messaging.
3. Add auth flows if needed (email/Google sign-in).
4. Add release workflow for signed AAB.
