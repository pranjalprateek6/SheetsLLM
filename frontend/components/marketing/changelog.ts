/* What changed, by day, in the product's words. Newest first. Add an entry
   when a change ships that a person would notice; leave out refactors,
   tests and tooling. */

export type ChangelogEntry = {
  date: string;
  title: string;
  items: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-10-13",
    title: "Questions answered from the data, recipes you can edit, and no AI for the common fixes",
    items: [
      "Chef answers a question about the values by running a query on every row and showing the result, so strict privacy mode answers real questions for the first time.",
      "Recipes can be edited: rename, move steps, remove steps, or take another file's steps. A reorder is planned on the file first.",
      "Clean numbers: \"$1,234.50\", \"(12)\" and \"12%\" read as numbers in one click, with a count of what could not be read and Undo beside it.",
      "Keep rows where: a plain condition from the column menu or typed into Chef, with no AI call.",
      "Terms, privacy and refund pages, and an account that can be deleted with everything in it.",
      "The server stays awake, and says when it is starting after a quiet spell.",
    ],
  },
  {
    date: "2026-10-11",
    title: "Chef reads as a conversation, and a sort that came out wrong says so",
    items: [
      "Sorting a column that mixes date formats shows a warning with a one-click fix.",
      "Chef's replies render headings and lists; the working line walks through what it is doing instead of claiming to write SQL.",
      "A clean file gets next steps instead of nothing; provider errors never reach the screen as raw text.",
      "JSON to CSV reads JSON Lines.",
    ],
  },
  {
    date: "2026-10-10",
    title: "A new site, twelve free tools, and recipe runs that survive month two",
    items: [
      "The public site rebuilt, with product pages for Clean, Chef, Recipes and Privacy.",
      "Twelve free tools that run in the browser: clean, dedupe, find and replace, change case, merge, split, columns, and conversions between CSV, Excel, JSON and delimiters.",
      "A recipe run matches a renamed column, reports each step's rows beside the last run, and runs the checks you set.",
      "A Monthly orders sample with a November file to try month two.",
    ],
  },
  {
    date: "2026-10-09",
    title: "Fixes with no AI, honest errors, receipts and redo",
    items: [
      "One-click fixes in every column header: trim, fill, drop empty rows, dedupe, standardise dates, change type, sort all rows, rename, drop.",
      "Every error says what happened and what to do next, with Edit and retry.",
      "Each AI step records what was sent; cache hits and recipe runs say No AI call.",
      "Undo keeps the step for Redo, which puts it back with no AI call.",
      "Recipes in the nav, the open file in the URL, exports named for what they hold.",
    ],
  },
  {
    date: "2026-10-08",
    title: "Strict privacy by default",
    items: [
      "The AI sees column names and types only unless you switch sample rows on.",
      "The upload's suggestions reach the chat panel; Stop catches a step the server saved anyway.",
    ],
  },
];
