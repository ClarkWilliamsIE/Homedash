// types.ts

export interface AuthState {
  token: string | null;
  user: {
    name: string;
    email: string;
    picture: string;
  } | null;
  isAuthenticated: boolean;
}

export interface Recipe {
  id: string;
  name: string;
  ingredients: string[];
  instructions?: string[];
  imageUrl: string;
  tags: string[];
}

export type DayOfWeek = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

// --- CHANGE HERE: Now an array of recipes ---
export interface WeeklyPlan {
  [key: string]: Recipe[]; 
}

export interface FamilyNote {
  id: string;
  text: string;
  color: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

export enum View {
  Dashboard = 'dashboard',
  Recipes = 'recipes',
  ShoppingList = 'shopping-list',
  Calendar = 'calendar',
  Setup = 'setup'
}
