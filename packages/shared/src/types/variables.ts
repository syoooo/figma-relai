// Design token / variable types

export type VariableResolvedType = "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";

export interface VariableValue {
  modeId: string;
  value: string | number | boolean | { r: number; g: number; b: number; a: number };
}

export interface VariableInfo {
  id: string;
  name: string;
  resolvedType: VariableResolvedType;
  description: string;
  valuesByMode: Record<string, unknown>;
}

export interface VariableCollectionInfo {
  id: string;
  name: string;
  modes: Array<{ modeId: string; name: string }>;
  variableIds: string[];
}
