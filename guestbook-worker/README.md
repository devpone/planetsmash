# Planet Smashburger – Worker

Der Worker bedient öffentliche Funksprüche, den globalen Besucherzähler, die Speisekarten-Umfrage und die globale Smash-Invaders-Highscoreliste über Cloudflare D1.

## Vor dem Deployment

1. Die bestehende D1-Datenbank `planet-funksprueche` verwenden.
2. Die echte D1-`database_id` in `wrangler.toml` eintragen. Keine Secrets in Git speichern.
3. Die vorhandenen Worker-Secrets `TURNSTILE_SECRET`, `RATE_SECRET` und `ADMIN_TOKEN` in Cloudflare beibehalten bzw. setzen.
4. Migrationen remote anwenden:
   `npx wrangler d1 migrations apply planet-funksprueche --remote`
5. Tests ausführen:
   `npm test`
6. Worker deployen:
   `npx wrangler deploy`

## Speisekarten-Umfrage

- `GET /survey/menu-feedback` – Bereitschaftsprüfung für das Frontend.
- `POST /survey/menu-feedback` – anonyme Antwort speichern.
- `GET /admin/survey/menu-feedback` – bis zu 250 Antworten plus Ja/Nein-Zusammenfassung; benötigt `Authorization: Bearer <ADMIN_TOKEN>`.
- D1-Schema: `migrations/0003_menu_feedback.sql`.

Die Website zeigt die Umfrage nur an, wenn der GET-Endpunkt mit `{"ok":true}` antwortet.


## Smash Invaders – globale Highscores

- `GET /game/highscores` – öffentliche globale Top 10.
- `POST /game/highscores` – Score speichern; nur von der erlaubten Website-Origin.
- Name: 1–24 Zeichen; Score muss eine nichtnegative ganze Hunderterzahl sein.
- Serverseitiges Rate-Limit: 30 Einsendungen pro Stunde/IP-Bucket.
- D1 behält die besten 100 Einträge; ausgeliefert werden die Top 10.
- `created_at` darf optional für die einmalige Übernahme bereits vorhandener lokaler Scores mitgeschickt werden.
- D1-Schema: `migrations/0004_game_highscores.sql`.
- Das Frontend versucht bestehende lokale Scores nach Aktivierung des globalen Backends automatisch zu übernehmen. Nach erfolgreicher Übernahme wird der lokale Fallback geleert.
