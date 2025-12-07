package com.ronika.iptvnative.api

import com.ronika.iptvnative.models.*
import retrofit2.http.Body
import retrofit2.http.POST

// Request body data classes
data class ApiCredentials(
    val mac: String,
    val url: String
)

data class GenreRequest(
    val mac: String,
    val url: String
)

data class ChannelsRequest(
    val mac: String,
    val url: String,
    val genre: String,
    val page: Int = 1,
    val sortBy: String = "number"
)

data class MoviesRequest(
    val mac: String,
    val url: String,
    val category: String,
    val page: Int = 1,
    val sortBy: String = "added",
    val type: String = "vod"
)

// Series request data classes
data class SeriesSeasonsRequest(
    val mac: String,
    val url: String,
    val seriesId: String
)

data class SeriesEpisodesRequest(
    val mac: String,
    val url: String,
    val seriesId: String,
    val seasonId: String,
    val page: Int = 1
)

data class SeriesFileInfoRequest(
    val mac: String,
    val url: String,
    val seriesId: String,
    val seasonId: String,
    val episodeId: String
)

data class StreamUrlRequest(
    val mac: String,
    val url: String,
    val cmd: String,
    val type: String = "itv",
    val episodeNumber: String? = null
)

data class SearchRequest(
    val mac: String,
    val url: String,
    val query: String,
    val page: Int = 1
)

data class SearchResponse(
    val data: List<Movie>,
    val total: Int
)

// Series response data classes
data class SeriesSeason(
    val id: String,
    val name: String?,
    val series_name: String?,
    val season_number: String?
)

data class SeriesSeasonsResponse(
    val seasons: List<SeriesSeason>
)

data class SeriesEpisode(
    val id: String,
    val name: String?,
    val series_number: String?,
    val time: String?,
    val cmd: String?
)

data class SeriesEpisodesResponse(
    val data: List<SeriesEpisode>,
    val total: Int
)

data class FileInfo(
    val id: String?,
    val name: String?
)

data class SeriesFileInfoResponse(
    val fileInfo: FileInfo?
)

interface ApiService {
    
    @POST("/api/stalker-proxy/handshake")
    suspend fun handshake(@Body credentials: ApiCredentials): Any
    
    @POST("/api/stalker-proxy/genres")
    suspend fun getGenres(@Body request: GenreRequest): GenresResponse
    
    @POST("/api/stalker-proxy/categories/movies")
    suspend fun getMovieCategories(@Body credentials: ApiCredentials): CategoriesResponse
    
    @POST("/api/stalker-proxy/categories/series")
    suspend fun getSeriesCategories(@Body credentials: ApiCredentials): CategoriesResponse
    
    @POST("/api/stalker-proxy/channels")
    suspend fun getChannels(@Body request: ChannelsRequest): ChannelsResponse
    
    @POST("/api/stalker-proxy/vod")
    suspend fun getMovies(@Body request: MoviesRequest): ItemsResponse
    
    @POST("/api/stalker-proxy/vod")
    suspend fun getSeries(@Body request: MoviesRequest): ItemsResponse
    
    @POST("/api/stalker-proxy/movie/info")
    suspend fun getMovieInfo(@Body request: Map<String, String>): MovieInfoResponse
    
    @POST("/api/stalker-proxy/series/seasons")
    suspend fun getSeriesSeasons(@Body request: SeriesSeasonsRequest): SeriesSeasonsResponse
    
    @POST("/api/stalker-proxy/series/episodes")
    suspend fun getSeriesEpisodes(@Body request: SeriesEpisodesRequest): SeriesEpisodesResponse
    
    @POST("/api/stalker-proxy/series/fileinfo")
    suspend fun getSeriesFileInfo(@Body request: SeriesFileInfoRequest): SeriesFileInfoResponse
    
    @POST("/api/stalker-proxy/stream")
    suspend fun getStreamUrl(@Body request: StreamUrlRequest): StreamUrlResponse
    
    @POST("/api/stalker-proxy/search")
    suspend fun searchContent(@Body request: SearchRequest): SearchResponse
}
