import { NextRequest, NextResponse } from 'next/server';
import { TMDBService } from '@/services/tmdbService';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');

  try {
    switch (action) {
      case 'search': {
        const query = searchParams.get('query');
        const type = searchParams.get('type') as 'movie' | 'tv';
        const year = searchParams.get('year');

        if (!query || !type) {
          return NextResponse.json(
            { error: 'Missing query or type parameter' },
            { status: 400 }
          );
        }

        const results = type === 'movie'
          ? await TMDBService.searchMovie(query, year ? parseInt(year) : undefined)
          : await TMDBService.searchTV(query, year ? parseInt(year) : undefined);

        return NextResponse.json({ success: true, results });
      }

      case 'details': {
        const id = searchParams.get('id');
        const type = searchParams.get('type') as 'movie' | 'tv';

        if (!id || !type) {
          return NextResponse.json(
            { error: 'Missing id or type parameter' },
            { status: 400 }
          );
        }

        const details = type === 'movie'
          ? await TMDBService.getMovieDetails(parseInt(id))
          : await TMDBService.getTVDetails(parseInt(id));

        return NextResponse.json({ success: true, details });
      }

      case 'smart-search': {
        const title = searchParams.get('title');
        const type = searchParams.get('type') as 'movie' | 'tv';
        
        if (!title || !type) {
          return NextResponse.json(
            { error: 'Missing title or type parameter' },
            { status: 400 }
          );
        }

        const year = TMDBService.extractYear(title);
        const details = await TMDBService.smartSearch(title, type, year);

        return NextResponse.json({ success: true, details });
      }

      case 'season': {
        const tvId = searchParams.get('tvId');
        const seasonNumber = searchParams.get('seasonNumber');
        
        if (!tvId || !seasonNumber) {
          return NextResponse.json(
            { error: 'Missing tvId or seasonNumber parameter' },
            { status: 400 }
          );
        }

        const seasonDetails = await TMDBService.getSeasonDetails(
          parseInt(tvId),
          parseInt(seasonNumber)
        );

        return NextResponse.json({ success: true, season: seasonDetails });
      }

      case 'externalIds': {
        const id = searchParams.get('id');
        const type = searchParams.get('type') as 'movie' | 'tv';
        
        if (!id || !type) {
          return NextResponse.json(
            { error: 'Missing id or type parameter' },
            { status: 400 }
          );
        }

        const externalIds = await TMDBService.getExternalIds(parseInt(id), type);

        return NextResponse.json({ success: true, data: externalIds });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action parameter' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('TMDB API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
