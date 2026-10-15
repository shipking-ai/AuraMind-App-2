# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Wear OS manifest components (WearSyncService, AuraMindTileService, # legacy-name: ok
# DueCountComplicationService, MainActivity) are kept automatically by AGP.
# The Wear Compose / Tiles / watchface-complications libraries ship their own
# consumer rules, matching the phone app's setup.

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile