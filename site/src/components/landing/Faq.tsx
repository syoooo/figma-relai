
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../Accordion';
import { Kicker } from './Kicker';
import { getCopy } from '../../lib/translations';
import { codeText } from './inline';

export function Faq() {
  const copy = getCopy().faq;

  return (
    <section id="faq" className="w-full">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:py-24">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
          <div>
            <Kicker>{copy.eyebrow}</Kicker>
            <h2 className="mt-3 font-heading text-[1.9rem] font-semibold leading-tight tracking-tight md:text-[2.5rem]">{copy.title}</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {copy.items.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border-border">
                <AccordionTrigger className="text-left text-sm hover:text-primary">{item.q}</AccordionTrigger>
                <AccordionContent className="t-prose text-sm text-muted-foreground">{codeText(item.a)}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
