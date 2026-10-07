// Synthetic contract data only. No live model accuracy or provider qualification is implied.
import { jevDigest } from "./jev";
import { type JevAssessment, type JevPolicy, jevQuestionVersion } from "./jev-contract";
export const syntheticJevPolicy: JevPolicy = {
  model: "typesafe/jev-1.13",
  snapshots: ["typesafe/jev-1.13-20260917"],
  guardrailRevision: "synthetic-not-qualified",
  inputCostMicros: 0.05,
  outputCostMicros: 0,
  maxCostMicros: 5000,
};
export function syntheticAssessment(): JevAssessment {
  return {
    questionVersion: jevQuestionVersion,
    policyDigest: jevDigest(syntheticJevPolicy) as string,
    model: "typesafe/jev-1.13-20260917",
    generationId: "gen-synthetic-assessment",
    inputTokens: 800,
    outputTokens: 90,
    costMicros: 40,
    answers: {
      grounding: {
        type: "choice",
        choice: "uncertain",
        confidence: 0.4,
        probabilities: { supported: 0.3, conflicting: 0.2, uncertain: 0.5 },
      },
      instructionFollowing: { type: "noul", noul: 0.1 },
      usefulness: {
        type: "score",
        score: 1.5,
        confidence: 0.5,
        probabilities: { "0": 0.1, "1": 0.3, "2": 0.6 },
      },
    },
  };
}
