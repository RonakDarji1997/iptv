export interface Category {
  id: string;
  name: string;
  title?: string;
  alias?: string;
  censored: boolean;
  type: 'LIVE' | 'MOVIE' | 'SERIES';
  isEnabled?: boolean;
}

export interface CategoriesResponse {
  categories: Category[];
  total: number;
}
