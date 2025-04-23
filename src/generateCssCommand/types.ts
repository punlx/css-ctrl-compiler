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

  // (NEW) เก็บโครงสร้าง Nested @query
  nestedQueries?: INestedQueryNode[];
}

/**
 * IQueryBlock - ของเดิม
 * (อาจไม่ถูกใช้งานแล้ว แต่คงไว้เพื่อไม่ข้าม logic เดิม)
 */
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

// --- ADDED FOR KEYFRAME ---
// IKeyframeBlock: โครงสร้างสำหรับเก็บข้อมูล keyframe ที่ parse ได้
export interface IKeyframeBlock {
  name: string; // เช่น "move"
  rawBlock: string; // เนื้อหาดิบ ๆ ภายใน { ... } (ไว้ไป parse ต่อในขั้นถัดไป)
}

// --- CHANGED FOR KEYFRAME ---
// เพิ่ม keyframeBlocks ใน return type
export interface IParseDirectivesResult {
  directives: IParsedDirective[];
  classBlocks: IClassBlock[];
  constBlocks: IConstBlock[];
  keyframeBlocks: IKeyframeBlock[]; // เพิ่ม
}
