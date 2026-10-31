
Roam — Razorpay Test Payment Integration Requirements
Status: Approved requirements for implementation planning
Scope: Test-mode payment integration only
Application: Roam (roam1)
Document purpose: Define the agreed process, architecture boundaries, security rules, and acceptance criteria before implementation.
1. Scope and non-negotiable restrictions
Implement a Razorpay payment flow for testing in the existing Roam mobile application.
- Razorpay Test Mode only.
- Do not implement live-mode payments, production activation, or real-money checkout.
- Do not add live API keys or live credentials.
- Preserve the existing application architecture and design system unless a separate change is approved.
- This document defines requirements; it does not itself modify application code.
2. Existing project context
The project specification describes:
- Expo SDK 57, React Native, and Expo Router.
- Clerk for existing user authentication.
- Sanity Studio as the headless CMS for stay/property content.
- Existing stay details and pricing fields, including nightly price, cleaning fee, and minimum nights.
- A Trips screen and a stay-detail “Book this stay” action.
- A booking-intent confirmation in the currently documented journey; a complete payment backend is not specified.
The project specification does not establish an existing payment backend or a persistent booking database. Do not assume Sanity is the booking/payment database.
3. Approved architecture decisions
Area	Approved decision
Payment provider	Razorpay
Environment	Test mode only
Mobile app	Existing Expo SDK 57 / React Native / Expo Router application
Authentication	Existing Clerk authentication
Payment backend	Local Node.js + Express backend
Development device	Physical phone
Availability	Demo availability check using existing stay data
Booking flow	Instant booking
Payment methods	UPI and credit/debit cards, using Razorpay-supported test checkout methods
Booking/payment persistence	No server-side persistent booking database in the initial version
Trips history	In-memory app state; completed test bookings may disappear after app process restart
Pricing	Full stay amount based on applicable project pricing fields
Date selection	Reuse existing date selection if present. If no date picker exists, ask the user before adding one
Failed/cancelled checkout	Return to the booking/stay screen, show status, and allow retry without falsely confirming a booking
Confirmation	Only after backend payment verification succeeds


4. Proposed end-to-end flow
1. The guest opens a stay and starts the booking flow.
2. Inspect and reuse existing date-selection functionality.
3. If no suitable date picker exists, stop and ask for approval before adding one.
4. Run the demo availability check using existing stay data. This is not a guarantee of real inventory availability.
5. Calculate the full stay price from trusted stay pricing data: nightly rate × number of nights, plus applicable cleaning fees and any other fees already defined by the project.
6. The mobile app requests a test order from the local Express backend.
7. The Express backend validates the requested stay/pricing inputs and creates a Razorpay test order using server-side credentials.
8. The app opens Razorpay checkout with supported test UPI/card methods.
9. The checkout result is sent to the backend for verification.
10. The backend verifies the Razorpay payment signature and checks the relevant order/payment identifiers and status.
11. Only if verification succeeds, the app displays booking confirmation and adds the completed test booking to in-memory Trips state.
12. If checkout fails, is cancelled, or verification fails, do not mark the booking as confirmed. Return to the booking/stay screen, display an accurate status, and allow retry where appropriate.
5. Backend responsibilities and API contract
The Express backend is responsible for trusted payment operations. Exact route names and request/response schemas are implementation details to be finalized during coding, while preserving these responsibilities:
- Create Razorpay orders in Test Mode.
- Validate the requested stay and calculate or independently validate the amount from trusted pricing data; do not trust a client-supplied total.
- Return only the fields the mobile app needs to launch checkout, such as the test Key ID and Razorpay order details.
- Verify payment signatures server-side using the Razorpay Key Secret.
- Validate that the payment result corresponds to the order created for the requested amount and currency, and confirm the payment status before allowing the app to show success.
- Return clear success/failure responses without exposing secrets.
- Handle duplicate requests and retries safely to the extent possible without a persistent database. Document any limitations caused by non-persistent server-side state.
Do not treat a client-side checkout success callback alone as proof of payment.
6. Security and configuration
- Keep the Razorpay Key Secret exclusively on the Express backend.
- Never embed the Key Secret in the Expo app, client-side environment variables, application bundle, or source control.
- Keep test credentials in backend environment variables and provide an example environment file containing placeholders only.
- Do not commit real credentials to Git.
- Use Test Mode credentials and test checkout flows exclusively.
- The physical device must be able to reach the local Express server over the development network or a suitable development tunnel. Do not assume the phone's localhost points to the development computer.
- Use the existing Clerk identity appropriately for authenticated requests; do not treat a client-supplied user ID as trusted identity without verifying the Clerk session/token on the backend.
- Do not log secrets or unnecessary payment-sensitive data.
7. Availability, dates, pricing, and booking state
Availability
The initial version uses a demo availability check based on existing stay data. It does not implement authoritative inventory, calendar synchronization, or prevention of overlapping confirmed bookings. Make this limitation clear in the UI or test documentation where relevant.
Dates
Reuse existing date-selection functionality if it exists and meets the flow's needs. If no date picker exists, ask the user before adding one. Do not silently introduce a new date-selection UI.
Pricing
Use the full stay price derived from trusted project data:
- Nightly rate multiplied by the number of nights.
- Cleaning fee where applicable.
- Other fees only if already defined by the project.
Validate amounts on the backend. Avoid accepting a client-provided total as authoritative. Do not invent additional fee types or business rules.
Trips state
Completed test bookings should appear in the Trips screen using in-memory state. The initial version has no persistent server-side booking/payment records, and in-memory entries may be lost when the app process restarts. Do not imply that this provides durable booking history.
8. Failure and cancellation handling
Cover at least these cases:
- Guest cancels checkout.
- Payment attempt fails.
- Network request to create an order fails.
- Backend payment verification fails or cannot complete.
- Duplicate submit or retry is attempted.
- Physical device cannot reach the local backend.
- The backend receives an unexpected or mismatched order/payment result.
For every failure case:
- Do not display a confirmed booking unless backend verification succeeds.
- Show a clear, accurate status.
- Return the guest to the booking/stay screen as agreed.
- Allow retry where appropriate without treating a previous unverified attempt as successful.
- Avoid creating duplicate in-memory bookings for the same verified checkout result.
9. Explicit exclusions
Not included in the initial scope:
- Razorpay Live Mode or real-money payments.
- Production payment activation or live credential configuration.
- A persistent booking/payment database.
- Durable or cross-device Trips history.
- Real inventory management or prevention of overlapping bookings.
- Host payouts, automatic refunds, coupons, or other payment features not explicitly approved.
- Adding a date picker without first asking the user if the existing project has none.
- Replacing Clerk, Sanity, or the current app architecture.
10. Acceptance criteria
The implementation will be considered aligned with this specification when:
- The flow uses Razorpay Test Mode only.
- The mobile app can request an order from the local Express backend on the physical test device.
- The Key Secret is not present in the mobile app or its bundle.
- UPI and card test checkout flows are documented and tested using methods supported by Razorpay Test Mode.
- The backend independently validates the amount and verifies the payment signature.
- Booking confirmation is shown only after successful backend verification.
- Failed, cancelled, and unverifiable attempts do not create confirmed bookings.
- Verified test bookings appear in the Trips screen during the current app session.
- The implementation preserves existing Clerk authentication and the current design system.
- No live-payment functionality or production credentials are added.
- Any missing date picker triggers a question to the user rather than an unapproved UI change.
- The temporary-storage and demo-availability limitations are documented.
11. Implementation sequence
1. Inspect the current stay details, pricing helpers, date-selection behavior, Trips screen, Clerk token/session access, package versions, and Expo SDK compatibility.
2. Report whether a date picker or existing backend is present; ask before adding a date picker if one is missing.
3. Define the Express API request/response contracts and local device connectivity approach.
4. Configure Razorpay Test Mode credentials as backend-only environment variables.
5. Implement test order creation and backend payment verification.
6. Integrate the supported Razorpay checkout flow into the Expo app, checking compatibility with the existing Expo SDK and native build setup before adding dependencies.
7. Connect verified success to the existing in-memory Trips state and handle failure/cancellation paths.
8. Test successful, failed, cancelled, duplicate-submit, invalid-signature, and network-error cases.
9. Run applicable type checks and project validation, and document any environment-specific steps or remaining limitations.
Security reminder: Test Mode is mandatory for this scope. Never place the Razorpay Key Secret in the mobile app. Do not add or enable Live Mode as part of this work.UI/UX Implementation Requirements — Roam Payment Integration

Design and implement the Razorpay test-payment flow using the existing Roam application UI and design system. The payment screens must look like a natural continuation of the current app, not a separate or generic checkout application.

1. First inspect the existing UI

Before implementing anything, inspect:

roam1/design_system.md

roam1/src/global.css

roam1/src/components/roam-ui.tsx

roam1/src/components/ui/

The existing stay-details screen, Trips screen, navigation layouts, and pricing helpers.

Reuse existing design tokens, components, typography, spacing, and interaction patterns. Do not redesign unrelated screens or introduce a new visual theme.

2. Follow Roam's design language

Use the existing project tokens as the source of truth:

Primary yellow: #FFC629 / #FFB000

Lavender accents: #C9B4FF / #B291F5

Ink typography: #111116 / #0B0B1A

White cards: #FFFFFF

Muted surfaces: #F4F5F7

App background: #F1F4F8

Manrope typography

Rounded cards, pill-shaped primary buttons, and existing safe-area conventions.

Prefer existing theme tokens over hardcoded values wherever possible. If the actual design-system files differ from these documented values, follow the current files and report the discrepancy.

3. Implement these UI states

A. Booking summary

Show the selected stay's existing title and location.

Display check-in/check-out dates if already supported.

Show number of nights, nightly rate, cleaning fee, applicable existing fees, and the full total.

Reuse the existing stay-detail design and primary CTA.

If no date picker exists, ask before adding one.

B. Payment checkout

Clearly identify the transaction as a test payment.

Support Razorpay's available test checkout methods for UPI and cards.

Use Razorpay's supported checkout UI rather than unnecessarily recreating sensitive payment-entry fields.

Keep the amount consistent with the backend-created order.

C. Processing

Display a loading state while creating an order and verifying payment.

Disable repeated submissions while a request is in progress.

Prevent accidental duplicate booking entries.

D. Payment success

Show success only after the backend verifies the payment.

Display the stay summary, amount, and test-payment status.

Provide a clear action to view Trips or return to the stay.

Use the existing Roam success colors and components.

E. Payment failure or cancellation

Return to the booking/stay screen.

Explain whether the payment failed, was cancelled, or could not be verified.

Provide a retry option where appropriate.

Never show a confirmed booking for an unverified payment.

F. Trips screen

Show verified test bookings using the existing Trips layout and card components.

Follow the existing typography, spacing, colors, and corner radii.

Booking history is in-memory only and may disappear when the app restarts.

4. Accessibility and responsiveness

Respect iOS and Android safe areas.

Maintain readable typography and accessible contrast.

Ensure totals, dates, long stay names, and status labels fit narrow screens.

Reuse existing button, surface, and text components.

Include appropriate pressed, disabled, loading, success, and error states.

Preserve existing navigation behavior.

5. Scope restrictions

Razorpay Test Mode only; never add live-payment functionality.

Do not expose the Razorpay Key Secret in the mobile app.

Do not add a persistent booking database.

Do not add a date picker without asking if none exists.

Do not modify unrelated screens or change the established design system.

6. Acceptance criteria

The payment flow must visually match Roam, reuse existing components, display consistent booking totals, handle success and failure correctly, and show confirmation only after backend verification.

Before coding, report which existing components and tokens will be reused. Then implement only the approved payment-flow UI and integration, and run the applicable type checks and project validation.