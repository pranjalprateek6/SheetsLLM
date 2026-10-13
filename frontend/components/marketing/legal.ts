/* The three legal documents: terms of service, privacy policy and refund
   policy, as data, rendered by LegalPage. Written to match what the code
   does today (strict privacy by default, Razorpay monthly billing, account
   deletion that removes everything), so a change to either must change both.

   OPERATOR is the one place the legal identity lives. Fill it in before
   relying on these pages. */

export const OPERATOR = {
  /** The name the service is offered under */
  name: "SheetsLLM",
  /** Where the operator is based, and whose law applies */
  country: "India",
  /** Set NEXT_PUBLIC_CONTACT_EMAIL for a written contact address */
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "",
};

export const LEGAL_UPDATED = "2026-10-13";

export type LegalSection = { heading: string; paragraphs: string[]; bullets?: string[] };

export type LegalDoc = {
  slug: "terms" | "privacy" | "refunds";
  href: string;
  /** Short name for links and the footer */
  name: string;
  title: string;
  /** One line under the title */
  summary: string;
  sections: LegalSection[];
};

const contact = OPERATOR.contactEmail
  ? `Write to ${OPERATOR.contactEmail}.`
  : "Use the Feedback button inside the app, or the contact details on the account page.";

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "terms",
    href: "/legal/terms",
    name: "Terms",
    title: "Terms of service",
    summary: "The agreement between you and SheetsLLM when you use the website, the app or the free tools.",
    sections: [
      {
        heading: "1. Who we are and what you agree to",
        paragraphs: [
          `${OPERATOR.name} is operated from ${OPERATOR.country}. These terms apply to the website, the signed-in app and the free browser tools. By creating an account or using the service you agree to them and to the Privacy policy. If you do not agree, do not use the service.`,
        ],
      },
      {
        heading: "2. The service",
        paragraphs: [
          "SheetsLLM lets you upload a spreadsheet file, describe a cleanup in plain words or apply one-click fixes, save the steps as a recipe, run that recipe on a later file, and export the result. The free tools on the website run entirely in your browser and send nothing to us.",
          "We may add, change or remove features. We will not reduce what a paid plan includes during a period you have already paid for.",
        ],
      },
      {
        heading: "3. Your account",
        paragraphs: [
          "You need an account for the app. You must be at least 18 and give a working email address. Keep your sign-in details to yourself and tell us if you believe someone else has used your account. One account is for one person.",
        ],
      },
      {
        heading: "4. Your files",
        paragraphs: [
          "Your files and everything made from them stay yours. You give us permission to store and process them only to provide the service to you, as described in the Privacy policy. You are responsible for having the right to upload what you upload, including any personal data it holds about other people.",
        ],
      },
      {
        heading: "5. AI results",
        paragraphs: [
          "Chef, the assistant, turns your request into a read-only query that runs against your file. It can be wrong. Preview every change, use undo and the history, and check an export before you rely on it. You decide what to keep.",
        ],
      },
      {
        heading: "6. What you may not do",
        paragraphs: ["You agree not to:"],
        bullets: [
          "use the service for anything unlawful, or upload content you have no right to use",
          "upload files meant to harm the service or other users",
          "work around plan limits, rate limits or security measures",
          "scrape, copy, resell or offer the service as your own",
          "probe or test the service for weaknesses without our written permission",
        ],
      },
      {
        heading: "7. Plans, payment and cancellation",
        paragraphs: [
          "The Free plan has monthly limits shown on the pricing page, and we may change those limits. Pro is a monthly subscription billed through Razorpay. It renews each month until you cancel. You can cancel at any time from the account page; you keep Pro until the end of the period you paid for and are not charged again.",
          "If a price changes, we tell you at least 30 days before it applies to you. Refunds are described in the Refund policy.",
        ],
      },
      {
        heading: "8. Availability",
        paragraphs: [
          "We work to keep the service available but do not promise it will be uninterrupted or free of faults. We may pause it for maintenance or because a provider we depend on is down. Keep your own copy of anything important.",
        ],
      },
      {
        heading: "9. Ending the agreement",
        paragraphs: [
          "You can end it at any time by deleting your account from the account page, which removes your files and data as described in the Privacy policy. We can suspend or close an account that breaks these terms, and will say why where the law allows.",
        ],
      },
      {
        heading: "10. Liability",
        paragraphs: [
          "The service is provided as it is. To the extent the law allows, we make no warranties, we are not liable for indirect loss or lost profits, and our total liability to you for any claim is limited to the amount you paid us in the 12 months before the claim. Nothing here limits liability that cannot be limited by law.",
        ],
      },
      {
        heading: "11. Law and disputes",
        paragraphs: [
          `These terms are governed by the laws of ${OPERATOR.country}, and its courts have jurisdiction. If you are a consumer, you keep any protection the law of your country gives you.`,
        ],
      },
      {
        heading: "12. Changes and contact",
        paragraphs: [
          "When these terms change, the date at the top changes and, for a material change, we tell signed-in users before it takes effect. Questions about these terms: " + contact,
        ],
      },
    ],
  },
  {
    slug: "privacy",
    href: "/legal/privacy",
    name: "Privacy",
    title: "Privacy policy",
    summary: "What we store, what the AI sees, where it lives, how long it stays, and how to get rid of it.",
    sections: [
      {
        heading: "1. What this covers",
        paragraphs: [
          `This policy covers the ${OPERATOR.name} website, the signed-in app and the free tools. It is written to match what the product does. The product page on privacy describes the same behaviour in plainer terms.`,
        ],
      },
      {
        heading: "2. What we hold about you",
        paragraphs: ["When you use the app we store:"],
        bullets: [
          "Account: your email address and how you sign in (Google, or email and password). Passwords are handled by our sign-in provider; we never see them.",
          "Files: each file you upload, kept as an exact copy in a columnar format, with its name, size and the column names and types.",
          "Steps and chat: every instruction you gave, the query that ran, Chef's replies, and the rows and columns before and after each step.",
          "Recipes: the saved steps, their checks, and which columns they expect.",
          "Usage: how many uploads and AI requests you made each month, to apply plan limits.",
          "Product events: which features were used and when, in our own database. Never a cell value.",
          "Settings: your strict privacy choice and similar preferences.",
          "Billing: your Razorpay subscription id and its status. Card and bank details go to Razorpay only; we never see them.",
          "Feedback you send us.",
        ],
      },
      {
        heading: "3. What the AI sees",
        paragraphs: [
          "Chef is powered by a third-party model, currently Google's Gemini API. Strict privacy is on by default: the model gets your column names, their types, and counts such as how many values are empty or distinct. It does not get a single value from your file.",
          "If you turn strict privacy off, the model also gets up to five sample values per column and up to five sample rows, so it can write better queries. Every AI step keeps a receipt of what was sent, which you can read in the history.",
          "Recipes, undo, redo and one-click fixes run stored queries and send nothing to the model. Requests to the model are processed under the provider's API terms.",
        ],
      },
      {
        heading: "4. Where it lives",
        paragraphs: ["We use these providers to run the service:"],
        bullets: [
          "Supabase for the database, file storage and sign-in",
          "Render for the server that processes your files",
          "Vercel for the website",
          "Razorpay for payments",
          "Google for the AI model, as described above",
        ],
      },
      {
        heading: "5. How long we keep it",
        paragraphs: [
          "Files, steps, chat and recipes stay until you delete them, or until you delete your account. Usage counters, settings, events and billing state stay while your account exists.",
          "Deleting your account removes all of it at once from our database and file storage, cancels any subscription, and removes your sign-in. Our providers may hold routine backups for a short time before they expire.",
        ],
      },
      {
        heading: "6. Cookies and local storage",
        paragraphs: [
          "We use the browser's storage to keep you signed in and to remember your theme, the getting-started checklist and the samples you picked. We set no advertising cookies and use no third-party analytics or tracking scripts. The free tools store nothing.",
        ],
      },
      {
        heading: "7. Your choices and rights",
        paragraphs: ["You can, at any time and without asking us:"],
        bullets: [
          "see and download any file from the Files page, with or without its steps applied",
          "delete any file, or all of its steps",
          "turn strict privacy on or off from the account page",
          "cancel a subscription from the account page",
          "delete your account and everything in it from the account page",
        ],
      },
      {
        heading: "8. Further rights",
        paragraphs: [
          "Depending on where you live, data protection law may give you further rights, such as a copy of your data in a portable form, correction, or a complaint to a supervisory authority. " + contact + " We answer within 30 days.",
          "We do not sell your data and we do not use it for advertising.",
        ],
      },
      {
        heading: "9. Children",
        paragraphs: ["The service is not for anyone under 18, and we do not knowingly collect their data. If you believe we have, tell us and we will delete it."],
      },
      {
        heading: "10. Changes and contact",
        paragraphs: [
          "When this policy changes, the date at the top changes and, for a material change, we tell signed-in users before it takes effect. Questions about privacy: " + contact,
        ],
      },
    ],
  },
  {
    slug: "refunds",
    href: "/legal/refunds",
    name: "Refunds",
    title: "Refund and cancellation policy",
    summary: "Cancel any time and keep Pro to the end of the month. Refunds for charges that should not have happened.",
    sections: [
      {
        heading: "1. Cancelling",
        paragraphs: [
          "Pro is billed monthly through Razorpay. Cancel at any time from the account page. You keep Pro until the end of the period you have paid for, and no further charge is made. Your files, recipes and history stay on the Free plan.",
        ],
      },
      {
        heading: "2. Part of a month",
        paragraphs: [
          "We do not refund the unused part of a month after you cancel. You keep the features you paid for until the period ends instead.",
        ],
      },
      {
        heading: "3. When we refund in full",
        paragraphs: ["We refund a charge in full when:"],
        bullets: [
          "you were charged after you cancelled",
          "you were charged twice for the same period",
          "the service was unavailable for most of a billing period because of a fault on our side",
        ],
      },
      {
        heading: "4. How to ask",
        paragraphs: [
          "Ask within 14 days of the charge, with the email address on your account and the date of the charge. " + contact + " An approved refund goes back through Razorpay to the payment method you used, usually within 5 to 7 working days of approval, depending on your bank.",
        ],
      },
      {
        heading: "5. The Free plan",
        paragraphs: ["The Free plan is not charged, so there is nothing to refund. Plan limits reset each month."],
      },
    ],
  },
];

export const legalDoc = (slug: string) => LEGAL_DOCS.find((d) => d.slug === slug);
