# Feedback: completed round feed

Branch: `bgn64/completed-round-feed`
Date: 2026-08-18

## Items

### F1 — Use rich round cards for completed rounds

- Verbatim: "The way the rounds show up when they are live or when I click on all of my rounds from the You tab is way more nice to look at than the simple total score view we get when we see completed rounds in the feed or recent rounds in the You tab. This interesting view should be the view for completed rounds in the Feed tab because most of the time no one is playing a live round so the Feed look pretty boring. However, I still want it to be clear whether a round is live or completed. Maybe we can apply similar headers/divisions as we use when we see all of our rounds where it says what month they were completed in."
- Triage: clean
- Proposed mockup change: Replace every completed-round row in Feed with the existing rich round-card presentation. Leave the compact Recent rounds summary in You unchanged. Keep LIVE as the only status badge, group completed Feed cards under month headers, and add an All rounds mockup screen that demonstrates the shared grouping pattern.
- Decision: overridden → accepted with You unchanged because its recent rounds are secondary, quick-glance content
- Backend: none

## Notes

The design should preserve strong live-round prominence while making the usual completed-round feed visually substantial. The Feed mockup includes a friend's active round below the unchanged Continue your round banner, followed by completed history. Month headers and final-score content imply completion; only friends' active rounds receive a LIVE badge. The You tab keeps its compact summary rows. After mockup review, all completed Feed and All rounds entries use full cards rather than mixing cards with mini rows, and the redundant "Completed rounds" divider text was removed.
