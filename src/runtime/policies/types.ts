export type PolicyViolation = {
  code: string;
  message: string;
};

export type PolicyDecision = {
  allowed: boolean;
  violations: PolicyViolation[];
};

