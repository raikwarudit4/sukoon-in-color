import Link from "next/link";
import { storeContact } from "@/lib/store-contact";

export const metadata = {
  title: "Cancellation & Refund Policy | Sukoon in Color",
  description: "Cancellation, return, and refund information for Sukoon in Color orders.",
};

export default function CancellationRefundsPage() {
  return (
    <main className="min-h-screen bg-[#fbf8f4] px-6 py-12 text-[#27221f] sm:py-16">
      <article className="mx-auto max-w-3xl rounded-2xl border border-[#eee5de] bg-white p-6 shadow-[0_6px_24px_rgba(72,47,37,0.04)] sm:p-10">
        <Link href="/" className="text-sm text-[#8f5558] hover:underline">← Back to shop</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">Sukoon in Color</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Cancellation &amp; Refund Policy</h1>
        <p className="mt-4 text-sm leading-6 text-[#716763]">We want you to know what to expect if you need to cancel an order or request a return.</p>

        <div className="mt-8 space-y-8 text-sm leading-7 text-[#514944]">
          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">1. Cancelling an order</h2>
            <p className="mt-2">You may request cancellation before your order is dispatched. Contact us with your order number and we will confirm whether the order can still be stopped. Once an order has been dispatched, it cannot be cancelled; eligible items may instead be submitted for a return under the terms below.</p>
            <p className="mt-2">For personalized or made-to-order items, cancellation may not be possible after work has begun. We will let you know if this applies to your order.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">2. Returns</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li><strong>Printable artworks:</strong> A return request may be submitted within 7 days after delivery. Submit it through your order page. The request is reviewed by our team; please keep the item in its original condition and packaging while we review it. Photos may be requested to help assess the request.</li>
              <li><strong>Original paintings:</strong> Original paintings are not eligible for change-of-mind returns. This does not limit your rights if an item is damaged, defective, or incorrect.</li>
              <li><strong>Damaged, defective, or incorrect items:</strong> Contact us as soon as possible with your order number and clear photos so we can review and help resolve the issue.</li>
            </ul>
            <p className="mt-2">A return request must be approved before an item is sent back. We will share the return instructions and any applicable shipping arrangements with you.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">3. Refunds</h2>
            <p className="mt-2">For a cancelled prepaid order, once we confirm cancellation we will initiate the refund to the original payment method. For an approved return, we will initiate the refund after the returned item is received and reviewed. Your bank or payment provider may take additional time to show the credit.</p>
            <p className="mt-2">For Cash on Delivery orders, contact us to arrange an eligible refund. We will confirm the necessary details directly with you.</p>
            <p className="mt-2">Shipping charges are refunded where required by applicable law or where the cancellation, damage, defect, or incorrect item is attributable to us.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">4. Contact us</h2>
            <p className="mt-2">For cancellation, return, or refund questions, contact Sukoon in Color:</p>
            <address className="mt-2 not-italic">
              {storeContact.name}<br />
              {storeContact.location}<br />
              Phone: <a className="text-[#8f5558] underline" href={`tel:${storeContact.phoneHref}`}>{storeContact.phone}</a><br />
              Email: <a className="text-[#8f5558] underline" href={`mailto:${storeContact.email}`}>{storeContact.email}</a>
            </address>
          </section>
        </div>

        <p className="mt-10 border-t border-[#eee5de] pt-5 text-xs leading-5 text-[#716763]">This policy does not limit any consumer rights available under applicable law.</p>
      </article>
    </main>
  );
}
