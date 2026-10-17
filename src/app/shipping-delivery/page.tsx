import Link from "next/link";
import { storeContact } from "@/lib/store-contact";

export const metadata = {
  title: "Shipping & Delivery | Sukoon in Color",
  description: "Shipping fees, dispatch estimates, and delivery information for Sukoon in Color orders.",
};

export default function ShippingDeliveryPage() {
  return (
    <main className="min-h-screen bg-[#fbf8f4] px-6 py-12 text-[#27221f] sm:py-16">
      <article className="mx-auto max-w-3xl rounded-2xl border border-[#eee5de] bg-white p-6 shadow-[0_6px_24px_rgba(72,47,37,0.04)] sm:p-10">
        <Link href="/" className="text-sm text-[#8f5558] hover:underline">← Back to shop</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">Sukoon in Color</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Shipping &amp; Delivery</h1>
        <p className="mt-4 text-sm leading-6 text-[#716763]">How we prepare and deliver your artwork.</p>

        <div className="mt-8 space-y-8 text-sm leading-7 text-[#514944]">
          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">Shipping fee</h2>
            <p className="mt-2">The applicable shipping fee is shown in your cart and again at checkout before you place your order. The checkout total is the amount charged for that order.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">Dispatch and delivery estimates</h2>
            <p className="mt-2">Dispatch or delivery estimates may vary by artwork, format, destination, and availability. Check the relevant product page for its current estimate. Estimates are indicative and may be affected by courier or other circumstances outside our control.</p>
            <p className="mt-2">We will prepare your order for the delivery address provided at checkout. Please check that the address and contact number are accurate before placing the order.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">Tracking</h2>
            <p className="mt-2">When tracking details are available, they will appear in your order information after the order has been dispatched. If you need help with a delivery, contact us with your order number.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">Delivery issues</h2>
            <p className="mt-2">If your parcel appears delayed, arrives damaged, or contains the wrong item, contact us as soon as possible. Please keep the packaging and share photos where relevant so we can review the issue.</p>
            <p className="mt-2">For cancellation and return eligibility, see our <Link href="/cancellation-refunds" className="text-[#8f5558] underline">Cancellation &amp; Refund Policy</Link>.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">Contact</h2>
            <p className="mt-2">{storeContact.name} · {storeContact.location}</p>
            <p>Phone: <a className="text-[#8f5558] underline" href={`tel:${storeContact.phoneHref}`}>{storeContact.phone}</a></p>
            <p>Email: <a className="text-[#8f5558] underline" href={`mailto:${storeContact.email}`}>{storeContact.email}</a></p>
          </section>
        </div>
      </article>
    </main>
  );
}
