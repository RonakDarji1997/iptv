package com.ronika.iptvnative.models

import com.google.gson.annotations.SerializedName

// Genre (for Live TV categories and VOD categories - shared model)
data class Genre(
    @SerializedName("id") val id: String,
    @SerializedName("title") val title: String?,
    @SerializedName("name") val name: String?,
    @SerializedName("alias") val alias: String?,
    @SerializedName("censored") val censored: Int?
) {
    fun getDisplayName(): String = title ?: name ?: "Unknown"
}

// Category (for Movies/Series)
data class Category(
    @SerializedName("id") val id: String,
    @SerializedName("title") val title: String?,
    @SerializedName("name") val name: String?,
    @SerializedName("alias") val alias: String?,
    @SerializedName("censored") val censored: Int?
) {
    fun getDisplayName(): String = title ?: name ?: "Unknown"
}

// Channel (Live TV)
data class Channel(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("number") val number: String?,
    @SerializedName("logo") val logo: String?,
    @SerializedName("cmd") val cmd: String?,
    @SerializedName("tv_genre_id") val genreId: String?,
    val isLive: Boolean = false
)

// Movie
data class Movie(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("year") val year: String?,
    @SerializedName("poster") val poster: String?,
    @SerializedName("screenshot") val screenshot: String?,
    @SerializedName("screenshot_uri") val screenshotUri: String?,
    @SerializedName("cover") val cover: String?,
    @SerializedName("cover_big") val coverBig: String?,
    @SerializedName("rating_imdb") val ratingImdb: String?,
    @SerializedName("category_id") val categoryId: String?,
    @SerializedName("cmd") val cmd: String?,
    @SerializedName("description") val description: String?,
    @SerializedName("actors") val actors: String?,
    @SerializedName("director") val director: String?,
    @SerializedName("country") val country: String?,
    @SerializedName("genres_str") val genresStr: String?,
    @SerializedName("o_name") val originalName: String?,
    @SerializedName("time") val duration: String?,
    @SerializedName("has_files") val totalEpisodes: String?,
    @SerializedName("is_series") val isSeries: String?
) {
    fun getImageUrl(): String? = screenshotUri ?: screenshot ?: coverBig ?: cover ?: poster
}

// Series
data class Series(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("year") val year: String?,
    @SerializedName("poster") val poster: String?,
    @SerializedName("screenshot") val screenshot: String?,
    @SerializedName("screenshot_uri") val screenshotUri: String?,
    @SerializedName("cover") val cover: String?,
    @SerializedName("cover_big") val coverBig: String?,
    @SerializedName("rating_imdb") val ratingImdb: String?,
    @SerializedName("category_id") val categoryId: String?,
    @SerializedName("description") val description: String?,
    @SerializedName("actors") val actors: String?,
    @SerializedName("director") val director: String?,
    @SerializedName("country") val country: String?,
    @SerializedName("genres_str") val genresStr: String?,
    @SerializedName("o_name") val originalName: String?,
    @SerializedName("has_files") val totalEpisodes: String?
) {
    fun getImageUrl(): String? = screenshotUri ?: screenshot ?: coverBig ?: cover ?: poster
}

// API Response wrappers
data class GenresResponse(
    @SerializedName("genres") val genres: List<Genre>
)

data class CategoriesResponse(
    @SerializedName("categories") val categories: List<Category>
)

data class ChannelsResponse(
    @SerializedName("channels") val channels: ChannelsData
)

data class ChannelsData(
    @SerializedName("data") val data: List<Channel>,
    @SerializedName("total") val total: Int
)

data class ItemsResponse(
    @SerializedName("items") val items: ItemsData
)

data class ItemsData(
    @SerializedName("data") val data: List<Movie>, // Will be used for both movies and series
    @SerializedName("total") val total: Int,
    @SerializedName("total_items") val totalItems: String?,
    @SerializedName("max_page_items") val maxPageItems: Int?
)

// Movie/Series info response
data class MovieInfoResponse(
    @SerializedName("fileInfo") val fileInfo: MovieFileInfo
)

data class MovieFileInfo(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String,
    @SerializedName("cmd") val cmd: String?
)

// Stream URL response
data class StreamUrlResponse(
    @SerializedName("url") val url: String
)
