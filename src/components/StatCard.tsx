type StatCardProps = {
  label: string;
  value: string | number | null;
  detail?: string;
  tone?: "neutral" | "positive" | "negative";
};

export function StatCard({ label, value, detail, tone = "neutral" }: StatCardProps) {
  return (
    <article className={`stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value ?? "-"}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}
