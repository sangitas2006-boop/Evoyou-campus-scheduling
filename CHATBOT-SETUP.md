# EVOYOU multilingual assistant

The static-site chat UI supports English, Hindi, and Marathi. It sends the current conversation to the `evoyou-assistant` Supabase Edge Function. On the timetable page, it sends a limited snapshot of locally stored sessions only when the user explicitly checks the schedule-sharing consent box. The function provides EVOYOU-specific grounding, conversational context, bounded local schedule awareness, and a general campus-timetabling help scope through an OpenAI-compatible chat-completions endpoint.

## Security and current status

- The browser contains only the Supabase project URL and publishable key. A publishable/anon key is designed to be public; it is not a service-role key.
- The model API key is read only from Supabase Function Secrets. Never put it in HTML, JavaScript, GitHub Pages secrets rendered into a public page, or this file.
- The function validates request sizes and roles, uses a timeout, limits CORS to configured origins, and treats sample schedule values as data, not instructions. CORS is not authentication; this prototype endpoint is public and must remain read-only.
- The migration adds a service-role-only rate-limit table/function. It stores a salted hash, not raw IP or chat text; the current limits are 8 requests per minute per client hash and 40 requests per minute project-wide. Requests fail closed if the limiter is unavailable.
- The function is read-only. It cannot apply a timetable change, publish a schedule, or send a notice.
- The chat widget is prepared, but the Edge Function, rate-limit migration, and model secrets must be deployed/configured before it can produce AI answers. Until then it displays a clear setup message rather than canned pretend answers.
- The demo schedule remains browser-local. A question does not include timetable rows unless the user explicitly opts in; when opted in, a limited snapshot is sent to the configured model provider. Do not include sensitive student information. The provider receives the question and conversation whenever the function is deployed.
- The public publishable key does not protect a paid model endpoint. Review provider billing and monitor usage before public launch; the rate limit is a guardrail, not a guarantee against abuse or cost.

## Deploy to the existing EVOYOU project

Project ref: `zmkdofymklptiwhriiyg` (EVOYOU). Do not link or deploy this function to the separate KYNEX project.

1. Install/use the Supabase CLI and authenticate to the account that owns the EVOYOU project.
2. From this repository root, run:

   ```sh
   supabase link --project-ref zmkdofymklptiwhriiyg
   supabase db push
   supabase secrets set OPENAI_API_KEY=YOUR_PROVIDER_KEY OPENAI_MODEL=YOUR_MODEL_NAME
   supabase secrets set OPENAI_BASE_URL=https://api.openai.com/v1
   supabase secrets set CHAT_ALLOWED_ORIGINS=https://sangitas2006-boop.github.io,http://localhost:4173,http://127.0.0.1:4173
   supabase functions deploy evoyou-assistant
   ```

3. Use a chat-completions-compatible model/provider. Set `OPENAI_BASE_URL` to its API base when it is not OpenAI's default; set `OPENAI_MODEL` to the exact model name your provider supports. Never share the provider key in chat or commit it to Git.
4. If the GitHub Pages URL differs from `https://sangitas2006-boop.github.io`, update `CHAT_ALLOWED_ORIGINS` to include the exact production origin and redeploy/re-set the secret. Include the origin without a trailing slash.
5. Test English, Hindi, and Marathi questions, a question about a local timetable session, a provider failure, and a basic non-project timetabling question. Confirm the response accurately distinguishes demo behavior from proposed production features.

## Front-end files

- `assets/evoyou-chat.js` — accessible floating chat widget, language labels, conversation handling, and bounded local demo schedule context.
- `supabase/functions/evoyou-assistant/index.ts` — project-grounded model proxy.
- `supabase/config.toml` — configures this public function endpoint to accept public-page requests; it has no admin capability. Keep allowed origins limited and do not add privileged behavior without authentication and authorization.
