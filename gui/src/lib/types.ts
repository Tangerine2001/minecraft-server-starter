import {KnownServerProps} from "@/lib/serverProps";

export interface World {
    name: string;
}

export type ServerProperties = KnownServerProps & Record<string, string | number | boolean>;

const DIFFICULTY_OPTIONS = ['peaceful', 'easy', 'normal', 'hard'] as const;
export type Difficulty = typeof DIFFICULTY_OPTIONS[number];

export const isDifficulty = (v: string): v is Difficulty =>
    (DIFFICULTY_OPTIONS as readonly string[]).includes(v);

