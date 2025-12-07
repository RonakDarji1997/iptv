package com.ronika.iptvnative.api

import com.ronika.iptvnative.constants.ApiConstants
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.TimeUnit

object ApiClient {
    // Backend API base URL (matching mobile app)
    private val BASE_URL = ApiConstants.BACKEND_URL
    
    // Stalker portal credentials
    var macAddress: String = ApiConstants.DEFAULT_MAC_ADDRESS
    var portalUrl: String = "http://example.com/stalker_portal/server/load.php"
    var bearerToken: String = ""
    
    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }
    
    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(loggingInterceptor)
        .connectTimeout(ApiConstants.CONNECT_TIMEOUT, TimeUnit.SECONDS)
        .readTimeout(ApiConstants.READ_TIMEOUT, TimeUnit.SECONDS)
        .writeTimeout(ApiConstants.WRITE_TIMEOUT, TimeUnit.SECONDS)
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
