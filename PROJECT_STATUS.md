# Sukoon in Color — Project Status

Updated: 2026-10-18 (Asia/Kolkata)

This is the continuity note for future work. It contains no credentials or secret values. Check live service dashboards before assuming remote configuration is current.

## Project and environment map

- Repository: `D:\EcommProject\sukoon-in-color`, branch `main`.
- Git base checked 2026-10-18: `main` tracks `origin/main` at `46ad8eb` (`Enforce store admin and owner permissions`); current team-access UI and migration 076 are uncommitted local work.
- Local Supabase migration files are present through `076_owner_team_access.sql`. Migration 075 is applied to OG and verified there; migration 076 is local only. DEV migration 075 remains pending until the matching code is ready for deployment.
- DEV Supabase is `sukoon-migration-check` (`ahmwtluxkmjsycksumvj`). The Netlify site has been configured to use this DEV project. Supabase has a single main branch on the free tier.
- The separate OG “Sukoon in color” Supabase project is the intended production database. The owner reported applying migration 074 there and verified the nullable `user_roles.store_id` plus partial unique indexes. OG now has an active Sukoon in color store, one active owner membership, imported catalog records, and Storage assets, as reported by the owner. Verify remote migration history before assuming later migrations are applied. Keep Netlify pointed at DEV until the reviewed production cutover.
- Local `.env.local` contains the expected public Supabase, server-only Supabase, Razorpay, and Shiprocket variable names. Never print, commit, or send their values. Any new environment variable must also be added to Netlify, even during a period without deployments.
- Netlify deployments were intentionally paused at one point to save build credits, and later deployments occurred. Current auto-build setting and remaining credits were not verified in this status pass.

## Work completed from initial requirements to date

- Set up the Next.js storefront and Supabase schema/RLS architecture. Migrations 001–074 provide store/product/catalog, inventory, carts/orders, payments, shipment records, invoices, returns, reviews, settings, metrics/dashboard, saved addresses, draft-product deletion, and the OG user-role scope correction. Migration 075 separates owner/admin authorization and is applied to OG. Migration 076 adds owner-managed team access and is local only.
- The owner reported DEV and OG verification of migration 074, and applied migration 075 to OG. The OG role permission query confirmed admins have catalog, inventory, order, review, and report permissions while owners have those plus store, customer, and marketing permissions. An admin-only test account was denied access to shipping and returns settings. Verify current remote histories before applying later files. OG setup includes the active store, owner membership, catalog records, and Storage assets, as reported by the owner.
- Connected authentication and customer profiles; created the collection, product detail, cart, checkout, customer orders, and admin/store management flows.
- Implemented searchable product catalog with category filters and sorting. This already exists in `src/app/page.tsx` and `src/components/catalog-filters.tsx`; do not reimplement it.
- Implemented original paintings and optional printable formats, per-size/material variant pricing, image gallery/full-size view, artwork specifications, and admin product editor. Painting orientation is admin-only, affects the original Art on Wall preview, and is hidden from public specifications.
- Art on Wall uses the selected dimensions/orientation and now preserves source image proportions. Portrait, nearly square, and landscape sample images were inspected; prior stretching came from `object-fill`, changed to `object-contain`.
- Added wishlist/cart moves and counts, product views/wishlist metrics, customer reviews with admin visibility and printable-only eligibility, and return requests for delivered printable products within seven days with evidence upload and an admin feature toggle.
- Added admin insights/low-stock information, order management/fulfillment, draft-product deletion, and manual/Shiprocket shipment workflows.
- Added a shared signed-in account strip across routes so users can identify the active email and sign out from admin and customer pages.
- Role authorization is separated in migration 075 and the matching Next.js guards. Admin-only access was confirmed on OG; owner-only store settings were blocked for the admin account. The local owner-only team access page and migration 076 let owners assign `admin`/`owner` to existing verified accounts or remove access. The database function prevents self-edits and demotion/removal of the last active owner. Migration 076 has not been applied remotely.
- Tested local store operation with Docker/Supabase at an earlier point; the user later chose not to rely on Docker for day-to-day work. Local browser checkout/order flows and builds were reported working at that time.
- Tested Razorpay Test Mode checkout and order/payment/stock transitions. The user confirmed on 2026-10-18 that `price_minor = 500` (₹5.00) for SKU `SIC-OP-SP-001` is an intentional temporary DEV test price. The previously stated intended regular price is ₹50,000 (5,000,000 paise); restore/verify that price before live launch and verify OG pricing separately.
- Shiprocket mock shipment simulation and manual shipment updates were exercised. Live credentials had API authentication problems/HTTP 403 and a blocked-login response in Postman; manual live shipment was subsequently completed. The user returned the application to mock mode for further local development. Automated live Shiprocket API operations remain unconfirmed.
- Added cancellation/refund and shipping policy pages, and centralized store contact details using `support@sukoonincolor.com` and the supplied phone number.
- GitHub repository has been initialized and pushed; recent changes are on `main` and local `main` was in sync with `origin/main` at the time of this note.

## Remaining work and open checks

### Before production launch

1. **Domain and authentication URLs:** acquire/configure the custom domain, point DNS at Netlify, then update the DEV/OG Supabase Auth Site URL and redirect allow-list as appropriate. Update payment return/origin and webhook URLs to the final HTTPS domain. Current known site was the Netlify subdomain; custom-domain status is unconfirmed.
2. **Customer email delivery:** choose/obtain an email sending provider and verify a sender domain. Configure auth confirmation/reset and transactional order/shipping/return emails. The support email is shown as contact information; actual mailbox ownership/delivery integration has not been confirmed. User previously wanted to handle customer email later.
3. **Razorpay live readiness:** complete merchant verification/KYC, configure separate live credentials and webhook on the production environment, and perform a controlled end-to-end live payment/refund check only when ready. Test Mode was the only checkout mode fully verified in the conversation.
4. **Production Supabase cutover:** review/backup OG project, apply the finalized migration sequence, verify schema/RLS and essential seed/config data, then switch the production deployment to OG. DEV and production must remain distinct.
5. **Tax and financial review:** explicitly deferred by the user. Confirm GST applicability, tax treatment, invoice requirements, accounting/refund handling with a qualified professional before live sales.
6. **Launch price and catalog review:** verify all product prices (especially Shiv Parvati, intended regular price ₹50,000 after the ₹10 test) and product dimensions/orientations in DEV and OG.
7. **Shipping operations:** decide whether manual courier booking is sufficient at launch. If automating Shiprocket, resolve live API access/credentials and validate real booking/tracking/webhook behavior. Manual live shipment was used successfully; API-authenticated live shipment is not confirmed.
8. **Deployment controls and environment sync:** confirm Netlify auto-deploy/build setting and credit status. Keep Netlify variables in sync with local server/public configuration; never expose secrets. Deploy the final tested commit and smoke-test auth, checkout, payment, order operations, and mobile layout.

### Previously deferred or not confirmed

- Custom domain purchase/verification and customer email provider setup.
- GST/accounting/finance review.
- Automated live Shiprocket API mode.
- Migration 076 is pending. Apply it to OG for local testing and verify owner-only team management and last-owner protection. Apply migration 075 and 076 to DEV with the matching code before deploying to Netlify. Earlier OG audits found legacy grants/RLS concerns; re-run the preflight against the current schema before production cutover.
- Current Netlify auto-deploy configuration and remaining build credits.

## Suggested next sequence

1. Keep the temporary DEV test price of ₹5 for SKU `SIC-OP-SP-001`; restore/verify the intended ₹50,000 price before live launch and verify other catalog prices. Migration 075 is applied to OG and role separation is verified. Apply 076 to OG for local team-access testing; apply 075–076 to DEV with the matching deployment.
2. Continue local feature work with deployments paused if that is still desired; record every new env var and add it to Netlify too.
3. Prepare domain/email and payment/shipping readiness, then do the OG Supabase cutover only after the production checklist is reviewed.

