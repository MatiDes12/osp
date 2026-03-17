export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* Camera grid will go here */}
        <div className="aspect-video rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] flex items-center justify-center text-[var(--color-muted)]">
          No cameras added yet
        </div>
      </div>
    </div>
  );
}
