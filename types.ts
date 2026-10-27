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

export interface Ingredient {
  amount: string; 
  unit: string;   
  item: string;   
}

export interface Instruction {
  text: string;
  isHeader: boolean;
}

export interface Recipe {
  id: string;
  /** On a planned meal: the date (YYYY-MM-DD) it's planned for. */
  plannedFor?: string;
  name: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  imageUrl: string;
  tags: string[];
  isFavorite?: boolean; // New Field
  isNew?: boolean;      // New Field
  /** A one-off meal on the plan (a BBQ, takeaways): just a title and a few things to buy. */
  isCustom?: boolean;
}

export type DayOfWeek = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

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
  location?: string;
  calendarName?: string;
  color?: string;
}

export enum View {
  Home = 'home',
  Lights = 'lights',
  Music = 'music',
  Settings = 'settings',
  Dashboard = 'dashboard',
  Recipes = 'recipes',
  ShoppingList = 'shopping-list',
  Calendar = 'calendar',
  Setup = 'setup'
}
