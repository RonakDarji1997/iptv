package com.ronika.iptvnative.api

import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.TimeUnit

object ApiClient {
    // Backend API base URL (use actual IP for real devices, 10.0.2.2 for emulator)
    // For emulator: use 10.0.2.2 to reach localhost on your Mac
    // For real device: use your computer's IP address on the network
    private const val BASE_URL = "http://10.0.2.2:2005"
    
    // Stalker portal credentials
    var macAddress: String = "00:1A:79:XX:XX:XX"
    var portalUrl: String = "http://example.com/stalker_portal/server/load.php"
    var bearerToken: String = ""
    
    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }
    
    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(loggingInterceptor)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()
    
    private val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl(BASE_URL)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()
    
    val apiService: ApiService = retrofit.create(ApiService::class.java)
    
    fun setCredentials(mac: String, portal: String) {
        macAddress = mac
        portalUrl = portal
    }
    
    fun getCredentials(): ApiCredentials {
        return ApiCredentials(macAddress, portalUrl)
    }
}
