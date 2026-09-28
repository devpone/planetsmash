# Planet Smashburger – Worker

Der Worker bedient öffentliche Funksprüche, den globalen Besucherzähler und die Speisekarten-Umfrage über Cloudflare D1.

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
