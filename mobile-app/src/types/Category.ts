export interface Category {
  id: string;
  name: string;
  categoryId?: string; // backend-provided category identifier (may differ from DB id)
  title?: string;
  alias?: string;
  censored: boolean;
  type: 'LIVE' | 'MOVIE' | 'SERIES';
  isEnabled?: boolean;
  providerId?: string;
}

export interface CategoriesResponse {
  categories: Category[];
  total: number;
}
