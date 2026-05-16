# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ── React Native bridge / TurboModules ────────────────────────────────────
-keep,includedescriptorclasses class com.facebook.react.bridge.** { *; }
-keep,allowobfuscation class * extends com.facebook.react.bridge.NativeModule
-keep,allowobfuscation @interface com.facebook.react.bridge.ReactMethod
-keepclassmembers,includedescriptorclasses class * {
    @com.facebook.react.bridge.ReactMethod public *;
    @com.facebook.react.uimanager.annotations.ReactProp <methods>;
    @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>;
}
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.hermes.** { *; }
-dontwarn com.facebook.react.**

# ── AndroidX Fragment lifecycle ───────────────────────────────────────────
# FragmentManager instantiates fragments by reflection — must keep
# default constructors and lifecycle methods of all Fragment subclasses.
-keep public class * extends androidx.fragment.app.Fragment {
    public <init>();
}
-keepclassmembers class * extends androidx.fragment.app.Fragment {
    public <init>();
    public void onAttach(android.content.Context);
    public void onCreate(android.os.Bundle);
    public android.view.View onCreateView(...);
    public void onViewCreated(android.view.View, android.os.Bundle);
    public void onStart();
    public void onResume();
    public void onPause();
    public void onStop();
    public void onDestroyView();
    public void onDetach();
}
-keep class androidx.fragment.app.** { *; }
-keep class androidx.lifecycle.** { *; }
-keepclassmembers class * extends androidx.lifecycle.ViewModel {
    <init>();
}
-keepclassmembers class * extends androidx.lifecycle.AndroidViewModel {
    <init>(android.app.Application);
}

# ── MediaPipe (@thinksys/react-native-mediapipe) ──────────────────────────
# Native bindings + Fragment subclasses call into these via reflection.
-keep class com.tsmediapipe.** { *; }
-keepclassmembers class com.tsmediapipe.** { *; }
-keepnames class com.tsmediapipe.**
-keep class com.google.mediapipe.** { *; }
-keepclassmembers class com.google.mediapipe.** { *; }
-keepnames class com.google.mediapipe.**
-dontwarn com.google.mediapipe.**

# ── Protobuf (used by MediaPipe to deserialize .task model files) ─────────
# Protobuf relies on reflection to find fields by name (e.g. typeUrl_).
# Without these rules, R8 renames the fields and MediaPipe model loading
# fails with: "Field typeUrl_ for com.google.protobuf.Any not found".
-keep class com.google.protobuf.** { *; }
-keepclassmembers class com.google.protobuf.** { *; }
-keepnames class com.google.protobuf.**
-keep class * extends com.google.protobuf.GeneratedMessageLite { *; }
-keep class * extends com.google.protobuf.GeneratedMessageV3 { *; }
-keep class * extends com.google.protobuf.MessageLite { *; }
-keepclassmembers class * extends com.google.protobuf.GeneratedMessageLite {
    <fields>;
    <methods>;
}
-keepclassmembers class * extends com.google.protobuf.MessageLite {
    <fields>;
    <methods>;
}
# Keep the inner field-name-based reflection used by Any.unpackFrom()
-keepclassmembers class ** {
    *** typeUrl_;
    *** value_;
    *** bitField0_;
    *** bitField1_;
}
-dontwarn com.google.protobuf.**

# ── TensorFlow Lite (used by MediaPipe internally) ────────────────────────
-keep class org.tensorflow.** { *; }
-dontwarn org.tensorflow.**

# ── CameraX (used by MediaPipe) ───────────────────────────────────────────
-keep class androidx.camera.** { *; }
-keepclassmembers class androidx.camera.** { *; }
-dontwarn androidx.camera.**

# ── Kotlin reflection (used by MediaPipe Kotlin classes) ──────────────────
-keep class kotlin.Metadata { *; }
-keep class kotlin.reflect.** { *; }
-keepclassmembers class **$Companion { *; }
-keepclasseswithmembers class **$$serializer { *; }

# ── Supabase / OkHttp / Kotlin coroutines ─────────────────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn kotlinx.coroutines.**

# ── React Native SVG ──────────────────────────────────────────────────────
-keep public class com.horcrux.svg.** { *; }

# ── Reanimated 3 ──────────────────────────────────────────────────────────
-keep class com.swmansion.reanimated.** { *; }

# ── Sentry React Native ───────────────────────────────────────────────────
-keepattributes LineNumberTable,SourceFile
-renamesourcefileattribute SourceFile
-keep class io.sentry.** { *; }
-dontwarn io.sentry.**

# ── Keep our own native code ──────────────────────────────────────────────
-keep class app.kickfix.** { *; }


