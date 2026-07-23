// Standard response types for v2 tools

export interface ToolWarning {
  category: "tokens" | "layout" | "accessibility" | "naming" | "general";
  message: string;
  nodeId?: string;
}

export interface RecommendedTool {
  tool: string;
  reason: string;
  args?: Record<string, unknown>;
}

export interface PartialFailure {
  item: string;
  error: string;
  recovery?: string;
}

export interface ToolResponse<T = unknown> {
  summary: string;
  data: T;
  warnings?: ToolWarning[];
  recommended_next?: RecommendedTool[];
  partial_failures?: PartialFailure[];
}

// Context tool output types

export interface NodeSummary {
  id: string;
  name: string;
  type: string;
  size: { width: number; height: number };
  position: { x: number; y: number };
  fill?: string;
  fillToken?: string | null;
  stroke?: string;
  strokeToken?: string | null;
  cornerRadius?: number | "mixed";
  opacity?: number;
  layout?: LayoutSummary | null;
  childSummary?: string;
  componentStatus?: string | null;
  tokenCoverage?: number;
}

export interface LayoutSummary {
  mode: "HORIZONTAL" | "VERTICAL" | "NONE";
  padding: string;
  gap: number;
  sizing: { horizontal: string; vertical: string };
}

export interface SelectionContextData {
  nodes: NodeSummary[];
  pageInfo: { id: string; name: string };
}

export interface DocumentOverviewData {
  name: string;
  currentPage: { id: string; name: string };
  pages: Array<{ id: string; name: string }>;
  counts: {
    components: number;
    styles: number;
    variableCollections: number;
  };
}

export interface DesignTokensData {
  collections: Array<{
    id: string;
    name: string;
    modes: Array<{ modeId: string; name: string }>;
    variableCount: number;
  }>;
  styles: {
    paint: number;
    text: number;
    effect: number;
    grid: number;
  };
}

export interface NodeDetailsData {
  node: NodeSummary;
  css?: string;
  boundVariables?: Record<string, unknown>;
  children?: NodeSummary[];
}

export interface SearchNodesData {
  matches: Array<{
    id: string;
    name: string;
    type: string;
    parentName?: string;
  }>;
  total: number;
}

// Analysis tool output types

export interface ColorUsageIssue {
  nodeId: string;
  nodeName: string;
  property: "fill" | "stroke" | "effect";
  color: string;
  suggestion?: string;
}

export interface ColorUsageData {
  totalProperties: number;
  boundCount: number;
  unboundCount: number;
  tokenCoverage: number;
  unboundColors: ColorUsageIssue[];
}

export interface LayoutIssue {
  nodeId: string;
  nodeName: string;
  issue: string;
  severity: "error" | "warning" | "info";
  suggestion?: string;
}

export interface LayoutQualityData {
  totalFrames: number;
  autoLayoutCount: number;
  autoLayoutCoverage: number;
  issues: LayoutIssue[];
}

export interface ComponentHealthData {
  totalComponents: number;
  totalInstances: number;
  detachedCount: number;
  issues: Array<{
    nodeId: string;
    nodeName: string;
    issue: string;
  }>;
}

export interface AccessibilityIssue {
  nodeId: string;
  nodeName: string;
  issue: string;
  contrastRatio?: number;
  requiredRatio?: number;
}

export interface AccessibilityData {
  issueCount: number;
  issues: AccessibilityIssue[];
}

export interface NodeDiffField {
  field: string;
  nodeA: unknown;
  nodeB: unknown;
}

export interface DiffNodesData {
  nodeA: { id: string; name: string };
  nodeB: { id: string; name: string };
  identical: boolean;
  differences: NodeDiffField[];
}

// Verification tool output types

export interface VerifyChangesData {
  nodeId: string;
  allMatch: boolean;
  fields: Array<{
    field: string;
    expected: unknown;
    actual: unknown;
    match: boolean;
  }>;
}

export interface DesignRuleResult {
  rule: string;
  passed: boolean;
  severity: "error" | "warning" | "info";
  message: string;
  nodeId?: string;
  fix?: RecommendedTool;
}

export interface ValidateDesignRulesData {
  rulesChecked: number;
  passed: number;
  failed: number;
  results: DesignRuleResult[];
}
