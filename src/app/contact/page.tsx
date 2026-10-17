import Link from "next/link";

export const metadata = {
  title: "Contact | Sukoon in Color",
  description: "Contact Sukoon in Color in Pune for order, delivery, return, and product questions.",
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[#fbf8f4] px-6 py-12 text-[#27221f] sm:py-16">
      <article className="mx-auto max-w-2xl rounded-2xl border border-[#eee5de] bg-white p-6 shadow-[0_6px_24px_rgba(72,47,37,0.04)] sm:p-10">
        <Link href="/" className="text-sm text-[#8f5558] hover:underline">← Back to shop</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">We’re here to help</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Contact Sukoon in Color</h1>
        <p className="mt-4 text-sm leading-6 text-[#716763]">For help with an order, delivery, return request, or a product, contact us using the details below. Including your order number helps us assist you.</p>
        <address className="mt-8 space-y-4 not-italic text-sm leading-6 text-[#514944]">
          <p><span className="block font-semibold text-[#27221f]">Email</span><a className="text-[#8f5558] underline" href="mailto:support@sukoonincolor.com">support@sukoonincolor.com</a></p>
          <p><span className="block font-semibold text-[#27221f]">Phone</span><a className="text-[#8f5558] underline" href="tel:+917000887490">7000887490</a></p>
          <p><span className="block font-semibold text-[#27221f]">Location</span>Pune, Maharashtra, India</p>
        </address>
        <p className="mt-8 border-t border-[#eee5de] pt-5 text-sm leading-6 text-[#716763]">You can also review our <Link href="/shipping-delivery" className="text-[#8f5558] underline">Shipping &amp; Delivery</Link> and <Link href="/cancellation-refunds" className="text-[#8f5558] underline">Cancellation &amp; Refund</Link> information.</p>
      </article>
    </main>
  );
}
