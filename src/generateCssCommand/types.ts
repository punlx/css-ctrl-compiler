// src/generateCssCommand/types.ts

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
  queries?: IQueryBlock[]; // (ยังคงไว้ตามโค้ดเดิม - อาจไม่ได้ใช้แล้ว)
  hasRuntimeVar?: boolean;

  nestedQueries?: INestedQueryNode[];

  pluginContainers?: Array<{
    containerName: string;
    props: Record<string, string>;
  }>;

  varContainers?: {
    [containerClass: string]: Record<string, string>;
  };
}

export interface IQueryBlock {
  selector: string;
  styleDef: IStyleDefinition;
}

/** (NEW) สำหรับ Nested @query */
export interface INestedQueryNode {
  selector: string;
  rawLines: string[];
  styleDef: IStyleDefinition;
  children: INestedQueryNode[];
}

/** directive */
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

/** keyframe */
export interface IKeyframeBlock {
  name: string;
  rawBlock: string;
}

/** parse result */
export interface IParseDirectivesResult {
  directives: IParsedDirective[];
  classBlocks: IClassBlock[];
  constBlocks: IConstBlock[];
  keyframeBlocks: IKeyframeBlock[];
  /** (NEW) สำหรับ @var top-level */
  varDefs: Array<{ varName: string; rawValue: string }>;
}
