export function FormAlert({
  tone,
  children,
}: {
  tone: 'error' | 'success';
  children: React.ReactNode;
}) {
  const isError = tone === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={
        'mb-4 rounded-[var(--radius-hp)] border px-3 py-2.5 text-sm ' +
        (isError ? 'border-danger text-danger-text' : 'border-success text-success-text')
      }
    >
      {children}
    </div>
  );
}
