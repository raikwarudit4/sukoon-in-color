import Link from "next/link";
import { storeContact } from "@/lib/store-contact";

export const metadata = {
  title: "Terms of Service | Sukoon in Color",
  description: "Terms for browsing and placing orders with Sukoon in Color.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#fbf8f4] px-6 py-12 text-[#27221f] sm:py-16">
      <article className="mx-auto max-w-3xl rounded-2xl border border-[#eee5de] bg-white p-6 shadow-[0_6px_24px_rgba(72,47,37,0.04)] sm:p-10">
        <Link href="/" className="text-sm text-[#8f5558] hover:underline">← Back to shop</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">Sukoon in Color</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Terms of Service</h1>
        <p className="mt-4 text-sm leading-6 text-[#716763]">These terms apply when you browse or place an order through the Sukoon in Color website.</p>

        <div className="mt-8 space-y-8 text-sm leading-7 text-[#514944]">
          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">1. Orders and accounts</h2>
            <p className="mt-2">You are responsible for providing accurate account, contact, and delivery information and for keeping your sign-in details secure. An order request is subject to product availability and confirmation by the store. If we cannot fulfil an order or need to correct an order issue, we will contact you using the details provided at checkout.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">2. Products, prices, and payment</h2>
            <p className="mt-2">Product descriptions, artwork dimensions, format options, prices, and availability are shown on the product page and may be updated. The cart and checkout show the order total, including the applicable shipping fee, before you place the order. Online payments are processed through Razorpay when that payment option is available. Cash on Delivery may be offered for eligible orders.</p>
            <p className="mt-2">An order is not treated as paid online until the payment is confirmed. If a payment is unsuccessful or its status is unclear, contact us with your order number before attempting another payment.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">3. Shipping and returns</h2>
            <p className="mt-2">Dispatch estimates and tracking information are described on the product page, in your order details, or in our <Link href="/shipping-delivery" className="text-[#8f5558] underline">Shipping &amp; Delivery information</Link>. Returns, cancellations, and refunds are governed by our <Link href="/cancellation-refunds" className="text-[#8f5558] underline">Cancellation &amp; Refund Policy</Link>.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">4. Website content and reviews</h2>
            <p className="mt-2">Artwork, photographs, product descriptions, and other store content belong to Sukoon in Color or their respective rights holders. Do not copy, republish, or use them commercially without permission. If you submit a review, you are responsible for its accuracy and should not include unlawful, abusive, or another person’s private information. Reviews may be moderated before appearing on the site.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">5. Site availability and applicable rights</h2>
            <p className="mt-2">We may update or temporarily suspend parts of the website for maintenance, security, or operational reasons. Nothing in these terms excludes consumer rights or remedies that cannot be excluded under applicable law.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">6. Contact</h2>
            <p className="mt-2">For questions about these terms or an order, contact {storeContact.name}, {storeContact.location}, at <a className="text-[#8f5558] underline" href={`mailto:${storeContact.email}`}>{storeContact.email}</a> or <a className="text-[#8f5558] underline" href={`tel:${storeContact.phoneHref}`}>{storeContact.phone}</a>.</p>
          </section>
        </div>
        <p className="mt-10 border-t border-[#eee5de] pt-5 text-xs leading-5 text-[#716763]">We may update these terms when the website or its services change. The latest version will be posted on this page.</p>
      </article>
    </main>
  );
}
