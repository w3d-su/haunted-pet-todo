export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-void px-6 py-16 text-ghost-white">
      <section className="w-full max-w-xl border-2 border-ghost-white bg-bg-panel px-6 py-8 text-center">
        <p className="text-[10px] leading-relaxed text-pumpkin">KIROWEEN 2026</p>
        <h1 className="mt-6 text-[16px] leading-relaxed">Haunted Pet To-Do</h1>
        <p className="mt-6 text-[10px] leading-relaxed text-ghost-dim">
          Finish a task and a little ghost pet thrives. Leave the list alone
          and the zombies crawl in.
        </p>
      </section>
    </main>
  );
}
