// src/generateCssCommand/helpers/createEmptyStyleDef.ts

import { IStyleDefinition } from '../types';

export function createEmptyStyleDef(): IStyleDefinition {
  return {
    base: {},
    states: {},
    screens: [],
    containers: [],
    pseudos: {},
    hasRuntimeVar: false,
  };
}
