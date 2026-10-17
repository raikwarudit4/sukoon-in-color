import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Sukoon in Color",
  description: "How Sukoon in Color uses information to provide shopping, payment, and delivery services.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#fbf8f4] px-6 py-12 text-[#27221f] sm:py-16">
      <article className="mx-auto max-w-3xl rounded-2xl border border-[#eee5de] bg-white p-6 shadow-[0_6px_24px_rgba(72,47,37,0.04)] sm:p-10">
        <Link href="/" className="text-sm text-[#8f5558] hover:underline">← Back to shop</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-[#a15e61]">Sukoon in Color</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Privacy Policy</h1>
        <p className="mt-4 text-sm leading-6 text-[#716763]">This policy describes information handled when you browse or shop with Sukoon in Color.</p>

        <div className="mt-8 space-y-8 text-sm leading-7 text-[#514944]">
          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">Information we handle</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li><strong>Account details:</strong> email address and the account information you provide, such as your name or phone number.</li>
              <li><strong>Orders and delivery:</strong> recipient name, phone number, delivery address, items purchased, order totals, payment status, and order history.</li>
              <li><strong>Shopping activity:</strong> cart and wishlist contents and basic product-view counts. Product-view counting uses a browser session identifier stored in session storage.</li>
              <li><strong>Customer submissions:</strong> review text and ratings, return reasons, and optional photos submitted with a return request.</li>
              <li><strong>Technical and session information:</strong> authentication/session cookies and information needed to keep the site and account working securely.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">How we use information</h2>
            <p className="mt-2">We use it to create and secure accounts, maintain carts and wishlists, accept and fulfil orders, arrange delivery, handle payments and returns, respond to customer questions, moderate reviews, and protect the store against misuse. We may also retain records needed for accounting, legal obligations, and resolving disputes.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">Service providers</h2>
            <p className="mt-2">We use service providers to operate the store and deliver its services. Supabase provides authentication, database, and file storage; Netlify hosts the website; Razorpay processes online payments; and Shiprocket may be used to arrange or track courier shipments. Information needed for a specific service may be shared with that provider. Their own terms and privacy notices also apply to their services.</p>
            <p className="mt-2">Online payment card or banking credentials are handled by the payment provider. Sukoon in Color uses payment references and status information to manage orders and does not need your payment password or banking PIN.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">Cookies, storage, and choices</h2>
            <p className="mt-2">The site uses authentication cookies to keep you signed in and browser session storage to count product views during a browsing session. You can sign out, clear browser storage, or contact us about account information. Clearing session data may affect account or site functionality.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">Retention and your requests</h2>
            <p className="mt-2">We keep information for as long as needed to provide the service, manage orders and returns, maintain security, and meet applicable legal or record-keeping requirements. You may contact us to request access to, correction of, or deletion of personal information associated with your account. We may need to retain some records where required or permitted by law.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#27221f]">Contact</h2>
            <p className="mt-2">For privacy questions or requests, contact Sukoon in Color at <a className="text-[#8f5558] underline" href="mailto:support@sukoonincolor.com">support@sukoonincolor.com</a> or <a className="text-[#8f5558] underline" href="tel:+917000887490">7000887490</a>. We are based in Pune, Maharashtra, India.</p>
            <p className="mt-2">See also our <Link href="/terms" className="text-[#8f5558] underline">Terms of Service</Link> and <Link href="/cancellation-refunds" className="text-[#8f5558] underline">Cancellation &amp; Refund Policy</Link>.</p>
          </section>
        </div>
        <p className="mt-10 border-t border-[#eee5de] pt-5 text-xs leading-5 text-[#716763]">We may update this policy when our services or information practices change. The latest version will be posted on this page.</p>
      </article>
    </main>
  );
}
