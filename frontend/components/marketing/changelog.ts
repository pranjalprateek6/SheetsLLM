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
    date: "2026-10-18",
    title: "Ten more free tools, and a workbook's sheets as files of their own",
    items: [
      "Pick several sheets of an Excel workbook when you upload it: each becomes its own file, named for the workbook and the sheet, and the workbook counts as one upload.",
      "New free tools that run in your browser: a CSV viewer, compare two CSV files, a CSV validator, fill down, extract emails, links and phone numbers, sort, transpose, and CSV to Excel, SQL, or a Markdown or HTML table.",
    ],
  },
  {
    date: "2026-10-16",
    title: "Try it without signing up, light and dark everywhere, and a grid that shows its width",
    items: [
      "Try it with no account: clean a month of messy orders with a few clicks, then run the same steps on November's file. Sign up and the steps come with you.",
      "Every page follows a light or dark choice, the home page and sign-in included, and light mode sits on a soft grey.",
      "A file wider than the grid fades on the side with more columns and has an arrow to page across.",
      "The grid's header stays solid while rows scroll under it.",
      "Next step in the step list puts the cursor in Chef's box.",
      "A chart groups rows with nothing in the column under (empty).",
    ],
  },
  {
    date: "2026-10-14",
    title: "Recipes that run themselves, Chef steps you see before they land, and every row in the grid",
    items: [
      "A recipe can run on a schedule: a link and a day of the month, and the cleaned file comes by email.",
      "Share a recipe's steps with a link; whoever opens it can add it to their own account.",
      "A shared file now opens a page with what it is and how it was cleaned, beside the download.",
      "Chef shows the step it would make, with the SQL and a few rows, and nothing changes until you apply it.",
      "Sorting and filtering in the grid cover every row, and scrolling loads the rest of the file.",
      "A warning about emptied cells shows the rows it means; a fix says how many cells it changed.",
      "Click a step to see the file as it was then, without going back.",
      "Sign in from the email link, or ask for a sign-in link instead of a password.",
      "The Free plan holds three recipes, and a practice recipe from the sample does not count.",
      "Ctrl or Cmd K opens a command palette that reaches every page and action, and ? lists every shortcut.",
      "Download a record of your account: settings, recipes, and every file with its steps.",
    ],
  },
  {
    date: "2026-10-13",
    title: "Questions answered from the data, recipes you can edit, and no AI for the common fixes",
    items: [
      "Lookup tables: link another file of yours under a short name, then add its columns from the column menu or ask Chef to join it. A recipe that uses one asks for it on a new file.",
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
