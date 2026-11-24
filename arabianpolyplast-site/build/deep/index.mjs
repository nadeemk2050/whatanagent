// Deep material content, merged into one lookup keyed by product slug.
import { PET_DEEP } from './pet.mjs';
import { OLEFIN_DEEP } from './olefins.mjs';
import { OTHER_DEEP } from './other.mjs';

export const DEEP = { ...PET_DEEP, ...OLEFIN_DEEP, ...OTHER_DEEP };
