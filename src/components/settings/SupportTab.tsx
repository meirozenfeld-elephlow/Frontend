export default function SupportTab() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">Support & feedback</h2>
      <p className="mt-1 text-sm text-slate-600">
        Need help or want to share feedback? Get in touch.
      </p>

      <div className="mt-4 grid gap-3 text-sm">
        <a
          href="mailto:support@yourapp.example?subject=Support%20request"
          className="inline-flex w-max items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-800 hover:bg-slate-50"
        >
          Email support
        </a>
        <a
          href="https://wa.me/1234567890"
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-max items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-800 hover:bg-slate-50"
        >
          WhatsApp
        </a>
        <a
          href="https://forms.gle/your-feedback-form"
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-max items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-800 hover:bg-slate-50"
        >
          Send feedback
        </a>
      </div>
    </section>
  );
}
