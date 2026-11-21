plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ly.signage.player"
    compileSdk = 34

    defaultConfig {
        applicationId = "ly.signage.player"
        minSdk = 24
        targetSdk = 34
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0.${System.getenv("GITHUB_RUN_NUMBER") ?: "0"}"
        buildConfigField("String", "PLAYER_URL", "\"https://signage-rsn7.netlify.app/play\"")
    }

    // مفتاح توقيع ثابت داخل المستودع حتى تُثبَّت التحديثات فوق النسخة القديمة
    signingConfigs {
        create("player") {
            storeFile = rootProject.file("signing.keystore")
            storePassword = "android"
            keyAlias = "signage"
            keyPassword = "android"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("player")
        }
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
}
