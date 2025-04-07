export interface IStyleDefinition {
  base: Record<string, string>;
  states: Record<string, Record<string, string>>;
  screens: Array<{
    query: string;
    props: Record<string, string>;
  }>;
  containers: Array<{
    query: string;
    props: Record<string, string>;
  }>;
  pseudos: {
    [key: string]: Record<string, string> | undefined;
  };
  varStates?: {
    [stateName: string]: Record<string, string>;
  };
  varBase?: Record<string, string>;
  varPseudos?: {
    [key: string]: Record<string, string>;
  };
  rootVars?: Record<string, string>;
  localVars?: Record<string, string>;
  queries?: IQueryBlock[];
  hasRuntimeVar?: boolean;
}
export interface IQueryBlock {
  selector: string;
  styleDef: IStyleDefinition;
}

export interface IParsedDirective {
  name: string;
  value: string;
}

export interface IClassBlock {
  className: string;
  body: string;
}

export interface IConstBlock {
  name: string;
  styleDef: IStyleDefinition;
}
