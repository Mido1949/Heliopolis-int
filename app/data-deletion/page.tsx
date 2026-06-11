export default function DataDeletionPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16 text-slate-800">
      <h1 className="text-3xl font-bold mb-2">Data Deletion Request</h1>
      <p className="text-sm text-slate-500 mb-10">HelioMax</p>

      <section className="mb-8">
        <p className="text-slate-600 leading-relaxed mb-6">
          You have the right to request deletion of any personal data we hold about you,
          including information submitted through lead forms, contact inquiries, or Meta
          (Facebook/Instagram) ad forms.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">How to Request Deletion</h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Send an email to{' '}
          <a href="mailto:admin@gchv.com" className="text-blue-600 underline font-medium">
            admin@gchv.com
          </a>{' '}
          with the subject line <strong>&ldquo;Data Deletion Request&rdquo;</strong> and include:
        </p>
        <ul className="list-disc list-inside text-slate-600 space-y-2 ml-2">
          <li>Your full name</li>
          <li>Your phone number or email address on file</li>
          <li>A brief description of the data you want deleted</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">What Happens Next</h2>
        <p className="text-slate-600 leading-relaxed">
          We will process your request within 30 days and confirm deletion via email. If we
          are unable to delete certain data due to legal or contractual obligations, we will
          inform you of the reason.
        </p>
      </section>

      <section>
        <p className="text-slate-500 text-sm">
          For general privacy inquiries, see our{' '}
          <a href="/privacy" className="text-blue-600 underline">
            Privacy Policy
          </a>
          .
        </p>
      </section>
    </div>
  );
}
