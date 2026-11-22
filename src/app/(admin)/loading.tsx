// يظهر مباشرة عند الانتقال بين الأقسام حتى تصل بيانات الصفحة
export default function Loading() {
  return (
    <main className="page page-loading" aria-busy="true" aria-label="جارٍ فتح الصفحة">
      <span className="skeleton skeleton-title" />
      <span className="skeleton" />
      <span className="skeleton" />
      <span className="skeleton skeleton-short" />
    </main>
  );
}
