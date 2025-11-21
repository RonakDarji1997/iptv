if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "/Users/ronika/.gradle/caches/8.8/transforms/7678f40d20735397e9efac58f4c88b0c/transformed/hermes-android-0.76.0-debug/prefab/modules/libhermes/libs/android.x86_64/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/ronika/.gradle/caches/8.8/transforms/7678f40d20735397e9efac58f4c88b0c/transformed/hermes-android-0.76.0-debug/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

