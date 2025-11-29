package com.ronika.iptvnative

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.request.CachePolicy
import coil.util.Logger
import coil.util.DebugLogger
import okhttp3.OkHttpClient

class IPTVApplication : Application(), ImageLoaderFactory {

    override fun onCreate() {
        super.onCreate()
        // Application initialization if needed
    }

    override fun newImageLoader(): ImageLoader {
        return ImageLoader.Builder(this)
            .crossfade(true)
            .okHttpClient {
                OkHttpClient.Builder()
                    .build()
            }
            .memoryCachePolicy(CachePolicy.ENABLED)
            .diskCachePolicy(CachePolicy.ENABLED)
            .networkCachePolicy(CachePolicy.ENABLED)
            .logger(object : Logger {
                override var level: Int = 3 // DEBUG level
                
                override fun log(tag: String, level: Int, message: String?, throwable: Throwable?) {
                    // Don't log coroutine cancellation errors - these are normal during tab switches
                    if (throwable?.message?.contains("StandaloneCoroutine was cancelled") == true) {
                        return
                    }
                    
                    // Use Android logging for other messages
                    when (level) {
                        2 -> android.util.Log.v(tag, message ?: "", throwable) // VERBOSE
                        3 -> android.util.Log.d(tag, message ?: "", throwable) // DEBUG
                        4 -> android.util.Log.i(tag, message ?: "", throwable) // INFO
                        5 -> android.util.Log.w(tag, message ?: "", throwable) // WARN
                        6 -> android.util.Log.e(tag, message ?: "", throwable) // ERROR
                        else -> android.util.Log.d(tag, message ?: "", throwable)
                    }
                }
            })
            .build()
    }
}