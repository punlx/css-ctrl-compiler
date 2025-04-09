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
  styleDef?: IStyleDefinition;
  children: INestedQueryNode[];

  // เราอาจจะ parse แล้วใส่ styleDef ไว้ตรงนี้ก็ได้
  // แต่ในตัวอย่างจะเก็บ styleDef ในขั้น process แล้วผูกใน object อื่น
  // เลยยังไม่ได้ใส่ตรงนี้
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
