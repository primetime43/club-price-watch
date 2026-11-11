# README screenshots

From `source/`, run:

```sh
npm run screenshots:preview
```

Open **http://127.0.0.1:4317/**. This separate Vite preview renders the real
React components and styles with the invented data in `fixtures.ts`. It never
starts the application server or opens a database. API writes are rejected;
backup, restore and retailer lookups are unavailable. A demo banner remains
visible, and the browser extension stays disconnected.

The club number `999999` and “Demo Club (fictional)” are documentation placeholders.
Product links use the reserved `example.invalid` domain. Product initials use
the app's normal fallback thumbnails, so no retailer image downloads are needed.
Dates are relative to preview startup to keep recent checks representative.

Capture only the page content, without browser chrome, desktop UI or developer
tools. Use a 1440-pixel desktop viewport for the watchlist and overview, and open
the coffee item's History for the detail screenshot. Keep the demo banner or
fictional location visible. Check each image before replacing the PNGs in
`source/docs/screenshots/` and keep the root README captions explicit about demo data.

These images illustrate the interface; they do not verify signed-in price checks.
