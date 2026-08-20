import { NavSidebar } from "@/components/nav-sidebar";
import { Input } from "@/components/ui/input";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full">
      <aside className="w-56 shrink-0 border-r bg-card">
        <NavSidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b px-6 py-3">
          <form action="/search" method="GET" className="w-full max-w-md">
            <Input
              type="search"
              name="q"
              placeholder="社内文書を検索（例: 出張の日当はいくら）"
              className="h-9"
            />
          </form>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
