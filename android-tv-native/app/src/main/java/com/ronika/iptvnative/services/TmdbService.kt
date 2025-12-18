package com.ronika.iptvnative.services

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * TMDB Service for fetching movie/series metadata, ratings, and images
 */
object TmdbService {
    private const val TAG = "TmdbService"
    
    // TODO: Add your TMDB API key to local.properties or build.gradle
    private const val TMDB_API_KEY = "2c9b5d9304b13ea66c0c81b49e3455e2" // Replace with actual key
    private const val TMDB_BASE_URL = "https://api.themoviedb.org/3"
    private const val TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p"
    
    data class TmdbMovie(
        val id: Int,
        val title: String,
        val originalTitle: String,
        val overview: String,
        val posterPath: String?,
        val backdropPath: String?,
        val releaseDate: String,
        val voteAverage: Double,
        val voteCount: Int,
        val popularity: Double
    )
    
    data class TmdbTVShow(
        val id: Int,
        val name: String,
        val originalName: String,
        val overview: String,
        val posterPath: String?,
        val backdropPath: String?,
        val firstAirDate: String,
        val voteAverage: Double,
        val voteCount: Int,
        val popularity: Double
    )
    
    data class TmdbDetails(
        val id: Int,
        val title: String?,
        val name: String?,
        val overview: String,
        val posterPath: String?,
        val backdropPath: String?,
        val releaseDate: String?,
        val firstAirDate: String?,
        val voteAverage: Double,
        val voteCount: Int,
        val runtime: Int?,
        val genres: List<Genre>,
        val productionCompanies: List<ProductionCompany>,
        val imdbId: String?,
        val tagline: String?,
        val status: String,
        val credits: Credits?
    )
    
    data class Genre(
        val id: Int,
        val name: String
    )
    
    data class ProductionCompany(
        val id: Int,
        val name: String,
        val logoPath: String?
    )
    
    data class Credits(
        val cast: List<CastMember>,
        val crew: List<CrewMember>
    )
    
    data class CastMember(
        val id: Int,
        val name: String,
        val character: String,
        val profilePath: String?,
        val order: Int
    )
    
    data class CrewMember(
        val id: Int,
        val name: String,
        val job: String,
        val department: String,
        val profilePath: String?
    )
    
    data class TmdbEpisode(
        val id: Int,
        val name: String,
        val overview: String,
        val episodeNumber: Int,
        val seasonNumber: Int,
        val stillPath: String?,
        val airDate: String,
        val voteAverage: Double,
        val runtime: Int?
    )
    
    data class TmdbSeason(
        val id: Int,
        val name: String,
        val overview: String,
        val seasonNumber: Int,
        val posterPath: String?,
        val airDate: String,
        val episodeCount: Int,
        val episodes: List<TmdbEpisode>?
    )
    
    data class ExternalIds(
        val imdbId: String?,
        val tvdbId: Int?,
        val facebookId: String?,
        val instagramId: String?,
        val twitterId: String?
    )
    
    /**
     * Search for movies by title
     */
    suspend fun searchMovie(query: String, year: Int? = null): List<TmdbMovie> = withContext(Dispatchers.IO) {
        try {
            val encodedQuery = URLEncoder.encode(query, "UTF-8")
            var urlString = "$TMDB_BASE_URL/search/movie?api_key=$TMDB_API_KEY&query=$encodedQuery&language=en-US&page=1&include_adult=false"
            
            if (year != null) {
                urlString += "&year=$year"
            }
            
            val response = makeApiCall(urlString)
            parseMovieResults(response)
        } catch (e: Exception) {
            Log.e(TAG, "Error searching movies", e)
            emptyList()
        }
    }
    
    /**
     * Search for TV shows by title
     */
    suspend fun searchTV(query: String, year: Int? = null): List<TmdbTVShow> = withContext(Dispatchers.IO) {
        try {
            val encodedQuery = URLEncoder.encode(query, "UTF-8")
            var urlString = "$TMDB_BASE_URL/search/tv?api_key=$TMDB_API_KEY&query=$encodedQuery&language=en-US&page=1&include_adult=false"
            
            if (year != null) {
                urlString += "&first_air_date_year=$year"
            }
            
            val response = makeApiCall(urlString)
            parseTVResults(response)
        } catch (e: Exception) {
            Log.e(TAG, "Error searching TV shows", e)
            emptyList()
        }
    }
    
    /**
     * Get detailed movie information
     */
    suspend fun getMovieDetails(movieId: Int): TmdbDetails? = withContext(Dispatchers.IO) {
        try {
            val urlString = "$TMDB_BASE_URL/movie/$movieId?api_key=$TMDB_API_KEY&language=en-US&append_to_response=credits,external_ids"
            val response = makeApiCall(urlString)
            parseDetails(response, "movie")
        } catch (e: Exception) {
            Log.e(TAG, "Error getting movie details", e)
            null
        }
    }
    
    /**
     * Get detailed TV show information
     */
    suspend fun getTVDetails(tvId: Int): TmdbDetails? = withContext(Dispatchers.IO) {
        try {
            val urlString = "$TMDB_BASE_URL/tv/$tvId?api_key=$TMDB_API_KEY&language=en-US&append_to_response=credits,external_ids"
            val response = makeApiCall(urlString)
            parseDetails(response, "tv")
        } catch (e: Exception) {
            Log.e(TAG, "Error getting TV details", e)
            null
        }
    }
    
    /**
     * Get season details with episodes
     */
    suspend fun getSeasonDetails(tvId: Int, seasonNumber: Int): TmdbSeason? = withContext(Dispatchers.IO) {
        try {
            val urlString = "$TMDB_BASE_URL/tv/$tvId/season/$seasonNumber?api_key=$TMDB_API_KEY&language=en-US"
            val response = makeApiCall(urlString)
            parseSeason(response)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting season details", e)
            null
        }
    }
    
    /**
     * Get external IDs (IMDb, etc.)
     */
    suspend fun getExternalIds(id: Int, type: String): ExternalIds? = withContext(Dispatchers.IO) {
        try {
            val urlString = "$TMDB_BASE_URL/$type/$id/external_ids?api_key=$TMDB_API_KEY"
            val response = makeApiCall(urlString)
            parseExternalIds(response)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting external IDs", e)
            null
        }
    }
    
    /**
     * Smart search - cleans title and searches
     */
    suspend fun smartSearch(title: String, type: String, year: Int? = null): TmdbDetails? {
        Log.e(TAG, "==========================================")
        Log.e(TAG, "smartSearch() CALLED!")
        Log.e(TAG, "Title: $title")
        Log.e(TAG, "Type: $type")
        Log.e(TAG, "Year: $year")
        Log.e(TAG, "==========================================")
        
        // Clean title
        var cleanTitle = title
            // Remove everything after common separators
            .replace(Regex("""\s*[-–|]\s*(ENGLISH|HINDI|TAMIL|TELUGU|SERIES|MOVIE|FILM).*""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""\s*\|\s*SERIES.*""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""\s*\|\s*MOVIE.*""", RegexOption.IGNORE_CASE), "")
            // Remove platform names
            .replace(Regex("""\s*\((English-)?Netflix\)""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""\s*\((English-)?Amazon\)""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""\s*\((English-)?Disney\+?\)""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""\s*\((English-)?HBO\)""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""\s*\((English-)?Hulu\)""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""\s*\((English-)?Prime\)""", RegexOption.IGNORE_CASE), "")
            // Remove language indicators
            .replace(Regex("""\s*\((English|Hindi|Tamil|Telugu|Multi|Dual)\)""", RegexOption.IGNORE_CASE), "")
            // Remove year
            .replace(Regex("""\s*\(?\d{4}\)?"""), "")
            // Remove episode info
            .replace(Regex("""\s*S\d+E\d+.*""", RegexOption.IGNORE_CASE), "")
            // Remove remaining brackets and parentheses content
            .replace(Regex("""\s*\[.*?\]"""), "")
            .replace(Regex("""\s*\(.*?\)"""), "")
            // Clean up extra spaces and trim
            .replace(Regex("""\s+"""), " ")
            .trim()
        
        Log.e(TAG, "Smart Search - Original: $title")
        Log.e(TAG, "Smart Search - Cleaned: $cleanTitle")
        
        // Try main search
        var results = if (type == "movie") searchMovie(cleanTitle, year) else searchTV(cleanTitle, year)
        
        Log.e(TAG, "Smart Search - Strategy 1 results: ${results.size}")
        
        // Strategy 2: If no results, try just taking text before first separator
        if (results.isEmpty()) {
            val altTitle = title.split(Regex("""\s*[-–|(]"""))[0]
                .replace(Regex("""\s*\d{4}.*"""), "")
                .trim()
            
            Log.e(TAG, "Smart Search - Strategy 2: $altTitle")
            results = if (type == "movie") searchMovie(altTitle, year) else searchTV(altTitle, year)
            Log.e(TAG, "Smart Search - Strategy 2 results: ${results.size}")
        }
        
        if (results.isEmpty()) {
            Log.e(TAG, "NO RESULTS FOUND!")
            return null
        }
        
        // Get details for first result
        val firstResult = results[0]
        Log.e(TAG, "Getting details for first result ID: ${if (type == "movie") (firstResult as TmdbMovie).id else (firstResult as TmdbTVShow).id}")
        
        return if (type == "movie") {
            val movie = firstResult as TmdbMovie
            getMovieDetails(movie.id)
        } else {
            val tv = firstResult as TmdbTVShow
            getTVDetails(tv.id)
        }
    }
    
    /**
     * Get image URLs
     */
    fun getPosterUrl(path: String?, size: String = "w500"): String? {
        return if (path != null) "$TMDB_IMAGE_BASE_URL/$size$path" else null
    }
    
    fun getBackdropUrl(path: String?, size: String = "w1280"): String? {
        return if (path != null) "$TMDB_IMAGE_BASE_URL/$size$path" else null
    }
    
    fun getEpisodeStillUrl(path: String?, size: String = "w300"): String? {
        return if (path != null) "$TMDB_IMAGE_BASE_URL/$size$path" else null
    }
    
    fun getProfileUrl(path: String?, size: String = "w185"): String? {
        return if (path != null) "$TMDB_IMAGE_BASE_URL/$size$path" else null
    }
    
    /**
     * Extract year from title
     */
    fun extractYear(title: String): Int? {
        val regex = Regex("""\\b(19|20)\\d{2}\\b""")
        val match = regex.find(title)
        return match?.value?.toIntOrNull()
    }
    
    // Helper functions
    private fun makeApiCall(urlString: String): String {
        val url = URL(urlString)
        val connection = url.openConnection() as HttpURLConnection
        
        // Configure SSL to be more lenient for emulators with clock issues
        if (connection is javax.net.ssl.HttpsURLConnection) {
            try {
                val trustAllCerts = arrayOf<javax.net.ssl.TrustManager>(object : javax.net.ssl.X509TrustManager {
                    override fun checkClientTrusted(chain: Array<java.security.cert.X509Certificate>, authType: String) {}
                    override fun checkServerTrusted(chain: Array<java.security.cert.X509Certificate>, authType: String) {}
                    override fun getAcceptedIssuers(): Array<java.security.cert.X509Certificate> = arrayOf()
                })
                val sslContext = javax.net.ssl.SSLContext.getInstance("TLS")
                sslContext.init(null, trustAllCerts, java.security.SecureRandom())
                connection.sslSocketFactory = sslContext.socketFactory
                connection.setHostnameVerifier { _, _ -> true }
            } catch (e: Exception) {
                Log.e(TAG, "SSL setup error: ${e.message}")
            }
        }
        
        try {
            connection.requestMethod = "GET"
            connection.connectTimeout = 10000
            connection.readTimeout = 10000
            
            val responseCode = connection.responseCode
            if (responseCode == HttpURLConnection.HTTP_OK) {
                return connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                Log.e(TAG, "API call failed with response code: $responseCode")
                return "{}"
            }
        } finally {
            connection.disconnect()
        }
    }
    
    private fun parseMovieResults(json: String): List<TmdbMovie> {
        val results = mutableListOf<TmdbMovie>()
        try {
            val jsonObj = JSONObject(json)
            val resultsArray = jsonObj.getJSONArray("results")
            
            for (i in 0 until resultsArray.length()) {
                val item = resultsArray.getJSONObject(i)
                results.add(TmdbMovie(
                    id = item.getInt("id"),
                    title = item.optString("title", ""),
                    originalTitle = item.optString("original_title", ""),
                    overview = item.optString("overview", ""),
                    posterPath = item.optString("poster_path", null),
                    backdropPath = item.optString("backdrop_path", null),
                    releaseDate = item.optString("release_date", ""),
                    voteAverage = item.optDouble("vote_average", 0.0),
                    voteCount = item.optInt("vote_count", 0),
                    popularity = item.optDouble("popularity", 0.0)
                ))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing movie results", e)
        }
        return results
    }
    
    private fun parseTVResults(json: String): List<TmdbTVShow> {
        val results = mutableListOf<TmdbTVShow>()
        try {
            val jsonObj = JSONObject(json)
            val resultsArray = jsonObj.getJSONArray("results")
            
            for (i in 0 until resultsArray.length()) {
                val item = resultsArray.getJSONObject(i)
                results.add(TmdbTVShow(
                    id = item.getInt("id"),
                    name = item.optString("name", ""),
                    originalName = item.optString("original_name", ""),
                    overview = item.optString("overview", ""),
                    posterPath = item.optString("poster_path", null),
                    backdropPath = item.optString("backdrop_path", null),
                    firstAirDate = item.optString("first_air_date", ""),
                    voteAverage = item.optDouble("vote_average", 0.0),
                    voteCount = item.optInt("vote_count", 0),
                    popularity = item.optDouble("popularity", 0.0)
                ))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing TV results", e)
        }
        return results
    }
    
    private fun parseDetails(json: String, type: String): TmdbDetails? {
        try {
            val obj = JSONObject(json)
            
            // Parse genres
            val genresArray = obj.optJSONArray("genres")
            val genres = mutableListOf<Genre>()
            if (genresArray != null) {
                for (i in 0 until genresArray.length()) {
                    val genreObj = genresArray.getJSONObject(i)
                    genres.add(Genre(
                        id = genreObj.getInt("id"),
                        name = genreObj.getString("name")
                    ))
                }
            }
            
            // Parse production companies
            val companiesArray = obj.optJSONArray("production_companies")
            val companies = mutableListOf<ProductionCompany>()
            if (companiesArray != null) {
                for (i in 0 until companiesArray.length()) {
                    val companyObj = companiesArray.getJSONObject(i)
                    companies.add(ProductionCompany(
                        id = companyObj.getInt("id"),
                        name = companyObj.getString("name"),
                        logoPath = companyObj.optString("logo_path", null)
                    ))
                }
            }
            
            // Parse credits
            val creditsObj = obj.optJSONObject("credits")
            var credits: Credits? = null
            if (creditsObj != null) {
                val castArray = creditsObj.optJSONArray("cast")
                val cast = mutableListOf<CastMember>()
                if (castArray != null) {
                    for (i in 0 until minOf(castArray.length(), 10)) { // Limit to 10 cast members
                        val castObj = castArray.getJSONObject(i)
                        cast.add(CastMember(
                            id = castObj.getInt("id"),
                            name = castObj.getString("name"),
                            character = castObj.optString("character", ""),
                            profilePath = castObj.optString("profile_path", null),
                            order = castObj.optInt("order", 0)
                        ))
                    }
                }
                
                val crewArray = creditsObj.optJSONArray("crew")
                val crew = mutableListOf<CrewMember>()
                if (crewArray != null) {
                    for (i in 0 until crewArray.length()) {
                        val crewObj = crewArray.getJSONObject(i)
                        crew.add(CrewMember(
                            id = crewObj.getInt("id"),
                            name = crewObj.getString("name"),
                            job = crewObj.optString("job", ""),
                            department = crewObj.optString("department", ""),
                            profilePath = crewObj.optString("profile_path", null)
                        ))
                    }
                }
                
                credits = Credits(cast, crew)
            }
            
            // Get IMDb ID from external_ids
            val externalIds = obj.optJSONObject("external_ids")
            val imdbId = externalIds?.optString("imdb_id", null)
            
            return TmdbDetails(
                id = obj.getInt("id"),
                title = if (type == "movie") obj.optString("title", null) else null,
                name = if (type == "tv") obj.optString("name", null) else null,
                overview = obj.optString("overview", ""),
                posterPath = obj.optString("poster_path", null),
                backdropPath = obj.optString("backdrop_path", null),
                releaseDate = if (type == "movie") obj.optString("release_date", null) else null,
                firstAirDate = if (type == "tv") obj.optString("first_air_date", null) else null,
                voteAverage = obj.optDouble("vote_average", 0.0),
                voteCount = obj.optInt("vote_count", 0),
                runtime = obj.optInt("runtime", -1).takeIf { it != -1 },
                genres = genres,
                productionCompanies = companies,
                imdbId = imdbId,
                tagline = obj.optString("tagline", null),
                status = obj.optString("status", ""),
                credits = credits
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing details", e)
            return null
        }
    }
    
    private fun parseSeason(json: String): TmdbSeason? {
        try {
            val obj = JSONObject(json)
            
            // Parse episodes
            val episodesArray = obj.optJSONArray("episodes")
            val episodes = mutableListOf<TmdbEpisode>()
            if (episodesArray != null) {
                for (i in 0 until episodesArray.length()) {
                    val epObj = episodesArray.getJSONObject(i)
                    episodes.add(TmdbEpisode(
                        id = epObj.getInt("id"),
                        name = epObj.optString("name", ""),
                        overview = epObj.optString("overview", ""),
                        episodeNumber = epObj.getInt("episode_number"),
                        seasonNumber = epObj.getInt("season_number"),
                        stillPath = epObj.optString("still_path", null),
                        airDate = epObj.optString("air_date", ""),
                        voteAverage = epObj.optDouble("vote_average", 0.0),
                        runtime = epObj.optInt("runtime", -1).takeIf { it != -1 }
                    ))
                }
            }
            
            return TmdbSeason(
                id = obj.getInt("id"),
                name = obj.optString("name", ""),
                overview = obj.optString("overview", ""),
                seasonNumber = obj.getInt("season_number"),
                posterPath = obj.optString("poster_path", null),
                airDate = obj.optString("air_date", ""),
                episodeCount = obj.optInt("episode_count", 0),
                episodes = episodes
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing season", e)
            return null
        }
    }
    
    private fun parseExternalIds(json: String): ExternalIds? {
        try {
            val obj = JSONObject(json)
            return ExternalIds(
                imdbId = obj.optString("imdb_id", null),
                tvdbId = obj.optInt("tvdb_id", -1).takeIf { it != -1 },
                facebookId = obj.optString("facebook_id", null),
                instagramId = obj.optString("instagram_id", null),
                twitterId = obj.optString("twitter_id", null)
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing external IDs", e)
            return null
        }
    }
}
