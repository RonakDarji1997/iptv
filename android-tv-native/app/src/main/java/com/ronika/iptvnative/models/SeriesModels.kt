package com.ronika.iptvnative.models

data class Season(
    val id: String,
    val name: String,
    val seasonNumber: String
)

data class Episode(
    val id: String,
    val name: String,
    val episodeNumber: String,
    val duration: String,
    val thumbnailUrl: String?,
    val seasonId: String,
    val cmd: String?
)
