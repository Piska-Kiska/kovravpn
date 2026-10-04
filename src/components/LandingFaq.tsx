// src/components/LandingFaq.tsx
//
// The FAQ of a landing page, fully rendered (no accordion, so every answer is
// indexable) together with the FAQPage markup built from the same array:
// Google wants the markup word for word the same as what is on the page.
// Server component; styles are the .gd-faq rules of guides.css.
import type { FaqItem } from "@/lib/faq-items";
import { buildFaqPageSchema, jsonLd } from "@/lib/structured-data";

export default function LandingFaq({ items }: { items: readonly FaqItem[] }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(buildFaqPageSchema(items)) }} />
      <section className="gd-faq" id="faq">
        <h2>Frequently asked questions</h2>
        {items.map((item) => (
          <div className="gd-faq-item" key={item.q}>
            <h3>{item.q}</h3>
            <p>{item.a}</p>
          </div>
        ))}
      </section>
    </>
  );
}
