import Link from "next/link";

type Category = { id: string; name: string; slug: string };

export function CatalogFilters({
  categories,
  query,
  category,
  sort,
}: {
  categories: Category[];
  query: string;
  category: string;
  sort: string;
}) {
  return (
    <form action="/" className="mb-8 grid gap-3 rounded-2xl border border-[#eee5de] bg-white p-4 sm:grid-cols-[1fr_190px_180px_auto]">
      <label className="sr-only" htmlFor="catalog-search">Search products</label>
      <input
        id="catalog-search"
        name="q"
        type="search"
        defaultValue={query}
        placeholder="Search the collection"
        className="min-w-0 rounded-xl border border-[#d9c9bf] bg-white px-4 py-3 text-sm outline-none focus:border-[#a15e61]"
      />
      <label className="sr-only" htmlFor="catalog-category">Category</label>
      <select id="catalog-category" name="category" defaultValue={category} className="rounded-xl border border-[#d9c9bf] bg-white px-3 py-3 text-sm">
        <option value="">All categories</option>
        {categories.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
      </select>
      <label className="sr-only" htmlFor="catalog-sort">Sort products</label>
      <select id="catalog-sort" name="sort" defaultValue={sort} className="rounded-xl border border-[#d9c9bf] bg-white px-3 py-3 text-sm">
        <option value="newest">Newest</option>
        <option value="price-asc">Price: low to high</option>
        <option value="price-desc">Price: high to low</option>
        <option value="name">Name: A to Z</option>
      </select>
      <div className="flex gap-2">
        <button className="rounded-xl bg-[#a15e61] px-5 py-3 text-sm font-semibold text-white hover:bg-[#884d50]">Apply</button>
        <Link href="/" className="rounded-xl border border-[#d9c9bf] px-4 py-3 text-sm text-[#716763]">Clear</Link>
      </div>
    </form>
  );
}
