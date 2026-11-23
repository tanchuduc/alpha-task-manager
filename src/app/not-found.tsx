import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center bg-slate-50 dark:bg-slate-950">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
        404 — Không tìm thấy trang
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Trang bạn yêu cầu không tồn tại hoặc đã được di chuyển.
      </p>
      <Link
        href="/home"
        className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover"
      >
        Về trang chủ
      </Link>
    </div>
  );
}
