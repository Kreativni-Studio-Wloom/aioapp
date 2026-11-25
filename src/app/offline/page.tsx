export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="text-4xl font-bold tracking-tighter">AIO</div>
      <p className="mt-4 font-medium">Jsi offline</p>
      <p className="mt-1 max-w-xs text-sm text-muted">Jakmile se připojíš, stránka se načte. Rozpracovaný trénink se uloží po obnovení spojení.</p>
    </div>
  );
}
