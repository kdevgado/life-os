import React from "react";

type Verse = {
  text: string;
  reference: string;
};

const VERSES: Verse[] = [
  {
    reference: "Jeremiah 29:11",
    text: "For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future.",
  },
  {
    reference: "Philippians 4:13",
    text: "I can do all things through Christ who strengthens me.",
  },
  {
    reference: "Proverbs 3:5-6",
    text: "Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to Him, and He will make your paths straight.",
  },
  {
    reference: "Psalm 46:1",
    text: "God is our refuge and strength, an ever-present help in trouble.",
  },
  {
    reference: "Isaiah 41:10",
    text: "So do not fear, for I am with you; do not be dismayed, for I am your God.",
  },
  {
    reference: "Romans 8:28",
    text: "And we know that in all things God works for the good of those who love Him, who have been called according to His purpose.",
  },
  {
    reference: "Matthew 11:28",
    text: "Come to me, all you who are weary and burdened, and I will give you rest.",
  },
];

const ROTATE_MS = 60 * 60 * 1000; // 1 hour

function getInitialIndex() {
  const now = Date.now();
  return Math.floor(now / ROTATE_MS) % VERSES.length;
}

export default function BibleVersePanel() {
  const [index, setIndex] = React.useState(getInitialIndex());
  const [fadeKey, setFadeKey] = React.useState(0);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % VERSES.length);
      setFadeKey((prev) => prev + 1);
    }, ROTATE_MS);

    return () => window.clearInterval(id);
  }, []);

  const verse = VERSES[index];

  return (
    <div className="lo-bible-text-only lo-bible-text-only--auto" key={fadeKey}>
      <p className="lo-bible-text-only__verse">
        “{verse.text}”
      </p>

      <div className="lo-bible-text-only__ref">
        {verse.reference}
      </div>
    </div>
  );
}