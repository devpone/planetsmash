# Planet Smashburger – öffentliche Funksprüche

Die Seite bleibt auf GitHub Pages. Der Worker nimmt Nachrichten entgegen und liest sie aus Cloudflare D1. Besucher brauchen kein Konto. Der Worker prüft vor dem Schreiben ein Turnstile-Token auf dem Server, begrenzt Beiträge auf vier pro Stunde und IP, begrenzt Länge und blockiert Links und HTML. Meldungen sind auf zehn pro Stunde begrenzt. IP-Adressen landen nicht im Nachrichtentisch; zeitlich begrenzte HMAC-Prüfwerte dienen der Begrenzung.

## Einmalige Einrichtung

1. Ein Cloudflare-Konto verwenden und Node.js installieren. Im Ordner `guestbook-worker` `npx wrangler login` ausführen.
2. `npx wrangler d1 create planet-funksprueche` ausführen und die angezeigte Datenbank-ID in `wrangler.toml` eintragen.
3. `npx wrangler d1 migrations apply planet-funksprueche --remote` ausführen.
4. In Cloudflare Turnstile ein Widget für `planetsmashburger.de` und `www.planetsmashburger.de` anlegen. Den **Site Key** in `../guestbook-config.js` eintragen. Den **Secret Key** ausschließlich als Worker Secret setzen: `npx wrangler secret put TURNSTILE_SECRET`.
5. Zwei weitere zufällige, lange Worker Secrets setzen: `npx wrangler secret put RATE_SECRET` und `npx wrangler secret put ADMIN_TOKEN`. Den Admin Token sicher für die Verwaltungsseite aufbewahren. Schlüssel nie in Git oder HTML eintragen.
6. `npx wrangler deploy` ausführen. Die angezeigte Worker-URL als `apiUrl` in `../guestbook-config.js` eintragen. Erst dann die Site-Dateien veröffentlichen. Die Wand liegt unter `/funksprueche.html`.
7. `https://planetsmashburger.de/funknachrichten-admin.html` öffnen, um Nachrichten mit dem Admin Token zu lesen und bei Bedarf auszublenden. Meldungen stehen dort oben.

Bei abweichender Domain `ALLOWED_ORIGIN` und `SITE_HOSTNAME` in `wrangler.toml` anpassen. Turnstile prüft die tatsächliche Domain. Für lokale Tests können die offiziellen Turnstile-Testschlüssel benutzt werden; niemals einen Test-Secret auf der öffentlichen Instanz verwenden.

**Vor Freischaltung:** Die bestehende Datenschutzseite um die Datenverarbeitung der öffentlichen Beiträge, Cloudflare D1, Turnstile und der Meldungen ergänzen und auf die tatsächlichen Cloudflare-Einstellungen prüfen. Den Link auf die Wand in die Startseite aufnehmen. Die Wand zeigt ohne öffentliche Konfiguration einen Wartestatus an und sendet keine Beiträge.
