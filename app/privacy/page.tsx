export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16 text-slate-800">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-slate-500 mb-10">Last updated: April 2026 — GCHV LOOMARK</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">1. Data We Collect</h2>
        <p className="text-slate-600 leading-relaxed">
          GCHV LOOMARK collects information submitted through lead forms and contact channels,
          including name, phone number, email address, and company details. This data is used
          solely to manage customer relationships and follow up on sales inquiries.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">2. Lead Forms</h2>
        <p className="text-slate-600 leading-relaxed">
          When you submit a lead form — whether through our website, Meta (Facebook/Instagram)
          ads, WhatsApp, or direct contact — your information is stored securely in our CRM
          system. It is accessible only to authorized GCHV staff.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">3. Contact Information</h2>
        <p className="text-slate-600 leading-relaxed">
          Contact details you provide (phone number, email address) are used to communicate
          with you about your inquiry, provide quotes, and offer after-sales support. We do
          not sell or share your contact information with third parties.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">4. Data Retention</h2>
        <p className="text-slate-600 leading-relaxed">
          We retain your data for as long as necessary to fulfill the purpose for which it was
          collected, or as required by applicable law. You may request deletion of your data
          at any time — see our{' '}
          <a href="/data-deletion" className="text-blue-600 underline">
            Data Deletion page
          </a>
          .
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">5. Contact Us</h2>
        <p className="text-slate-600 leading-relaxed">
          For any privacy-related questions, please contact us at{' '}
          <a href="mailto:admin@gchv.com" className="text-blue-600 underline">
            admin@gchv.com
          </a>
          .
        </p>
      </section>
    </div>
  );
}
