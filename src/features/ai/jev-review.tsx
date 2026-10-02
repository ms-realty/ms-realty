import { jevAssessmentSchema } from "@/server/ai/jev-contract";

const en = {
  title: "Automated draft assessment",
  boundary:
    "This assessment is an estimate, not factual approval. Check the source and all uncertain claims before recording your review.",
  grounding: "Support from the source",
  supported: "Appears supported",
  conflicting: "Possible contradiction",
  uncertain: "Insufficient evidence",
  injection: "Estimated chance of following untrusted instructions",
  usefulness: "Usefulness for this task (0–2)",
  details: "Assessment details",
  confidence: "Choice confidence",
  model: "Assessment model",
  rubric:
    "0: off-task or unusable. 1: needs substantial correction. 2: relevant, clear and preserves unknowns.",
};
const bg: typeof en = {
  title: "Автоматична оценка на черновата",
  boundary:
    "Тази оценка е приблизителна и не одобрява фактите. Проверете източника и всички несигурни твърдения, преди да запишете прегледа.",
  grounding: "Подкрепа от източника",
  supported: "Изглежда подкрепено",
  conflicting: "Възможно противоречие",
  uncertain: "Недостатъчно доказателства",
  injection: "Оценена вероятност за следване на недоверени инструкции",
  usefulness: "Полезност за задачата (0–2)",
  details: "Подробности за оценката",
  confidence: "Увереност в избора",
  model: "Модел за оценка",
  rubric:
    "0: извън темата или неизползваемо. 1: нужни са значителни поправки. 2: уместно, ясно и запазва неизвестните.",
};
const ru: typeof en = {
  title: "Автоматическая оценка черновика",
  boundary:
    "Эта оценка приблизительна и не подтверждает факты. Проверьте источник и все неопределённые утверждения перед записью своего решения.",
  grounding: "Подтверждение источником",
  supported: "Вероятно подтверждено",
  conflicting: "Возможно противоречие",
  uncertain: "Недостаточно данных",
  injection: "Оценка вероятности следования посторонним инструкциям",
  usefulness: "Полезность для задачи (0–2)",
  details: "Подробности оценки",
  confidence: "Уверенность в выборе",
  model: "Модель оценки",
  rubric:
    "0: не по теме или непригодно. 1: нужны существенные исправления. 2: уместно, понятно, неизвестное явно отмечено.",
};
export function JevReview({ value, locale }: { value: unknown; locale: string }) {
  const result = jevAssessmentSchema.safeParse(value);
  if (!result.success) return null;
  const copy = locale === "bg" ? bg : locale === "ru" ? ru : en;
  const { answers, model } = result.data;
  return (
    <section className="space-y-3 rounded-panel border border-border p-4">
      <h2 className="text-subheading font-semibold">{copy.title}</h2>
      <p>{copy.boundary}</p>
      <p>
        {copy.grounding}: <strong>{copy[answers.grounding.choice]}</strong>
      </p>
      <details className="space-y-3">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold underline underline-offset-4">
          {copy.details}
        </summary>
        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            [copy.confidence, `${Math.round(answers.grounding.confidence * 100)}%`],
            [copy.injection, `${Math.round(answers.instructionFollowing.noul * 100)}%`],
            [copy.usefulness, answers.usefulness.score.toFixed(2)],
            [copy.model, model],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-caption text-text-muted">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-caption text-text-muted">{copy.rubric}</p>
      </details>
    </section>
  );
}
