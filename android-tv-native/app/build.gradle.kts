plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.ronika.iptvnative"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.ronika.iptvnative"
        minSdk = 21
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
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

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

dependencies {
    // AndroidX Core
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.activity:activity-ktx:1.8.2")
    
    // RecyclerView and CardView
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("androidx.cardview:cardview:1.0.0")
    
    // Leanback for TV
    implementation("androidx.leanback:leanback:1.0.0")
    
    // Lifecycle components
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.7.0")
    implementation("androidx.lifecycle:lifecycle-livedata-ktx:2.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    
    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    
    // Room Database
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")
    
    // WorkManager for background sync
    implementation("androidx.work:work-runtime-ktx:2.9.0")
    
    // Retrofit for API calls
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.google.code.gson:gson:2.10.1")
    
    // ExoPlayer for video playback
    implementation("androidx.media3:media3-exoplayer:1.2.0")
    implementation("androidx.media3:media3-exoplayer-hls:1.2.0")
    implementation("androidx.media3:media3-ui:1.2.0")
    
    // Coil for image loading
    implementation("io.coil-kt:coil:2.5.0")
    
    // Material Design
    implementation("com.google.android.material:material:1.11.0")
}

// Custom tasks for automatic install and run after build
tasks.register("installAndRunDebug") {
    group = "custom"
    description = "Build, install, and run the debug APK on connected device"
    dependsOn("build", "installDebug")

    doLast {
        exec {
            workingDir = project.rootDir
            commandLine("adb", "shell", "am", "start", "-n", "com.ronika.iptvnative/.MainActivity")
        }
    }
}

tasks.register("installAndRunRelease") {
    group = "custom"
    description = "Build, install, and run the release APK on connected device"
    dependsOn("build", "installRelease")

    doLast {
        exec {
            workingDir = project.rootDir
            commandLine("adb", "shell", "am", "start", "-n", "com.ronika.iptvnative/.MainActivity")
        }
    }
}

// Make the default build task also install and run
tasks.named("build") {
    finalizedBy("installDebug")
}

tasks.register("runApp") {
    group = "custom"
    description = "Launch the app on connected device (assumes app is already installed)"

    doLast {
        exec {
            workingDir = project.rootDir
            commandLine("adb", "shell", "am", "start", "-n", "com.ronika.iptvnative/.MainActivity")
        }
    }
}
