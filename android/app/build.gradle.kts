plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.connect2world.easycomfyui"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.connect2world.easycomfyui"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0-alpha"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }

        register("alpha") {
            initWith(getByName("debug"))
            isDebuggable = false
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig = signingConfigs.getByName("debug")
            matchingFallbacks.add("debug")
            // Prevent AGP from injecting android:testOnly="true"
            // On AGP 8.x targeting API 34+, debug builds automatically get testOnly=true.
            // By using initWith(debug) + isDebuggable=false, the testOnly flag is avoided.
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = true
    }

    // ── Custom APK output naming ──
    android.applicationVariants.all {
        val variant = this
        variant.outputs.all {
            val output = this as com.android.build.gradle.internal.api.BaseVariantOutputImpl
            val variantName = variant.name // "debug" or "alpha"
            val apkName = when (variantName) {
                "alpha" -> "EasyComfyUI-v${variant.versionName}.apk"
                else -> "app-${variantName}.apk"
            }
            output.outputFileName = apkName
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.1")
    implementation("androidx.activity:activity:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
