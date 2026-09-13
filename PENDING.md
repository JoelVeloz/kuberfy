# Pendientes

Cosas que el usuario pidió explícitamente y todavía no están terminadas. Actualizar (tachar o borrar la línea) apenas se completen — no dejar que se acumule sin reflejar la realidad.

- [ ] **Botones de Restart / Stop en la UI.** El backend ya tiene `POST /api/applications/:id/restart` y `/stop` funcionando (dockerode directo), pero no hay ningún botón en `ApplicationDetail.tsx` que los llame todavía. Es lo único que falta para que la feature exista de punta a punta.
- [ ] **Página de Settings (dominio principal).** Ya existen: tabla `settings` en el schema, `GET`/`PATCH /api/settings` montado en `apps/api/src/index.ts`. Falta: el componente `SettingsForm` (o similar) y `apps/web/src/pages/settings.astro`, más el link en el sidebar (`Layout.astro`). Un agente se quedó a mitad de esto por rate limit — retomar desde ahí, no desde cero.
- [ ] **Campo de puerto interno en la UI de creación/edición de Application.** `application.port` solo se puede setear hoy vía API directa (curl/PATCH). Falta el input en `NewApplicationDialog.tsx` y una forma de editarlo después de creada la app (inline, mismo patrón que `DomainsCard.tsx`).
- [ ] **Validación real de formato de dominio.** Hoy `apiCreateDomain` acepta cualquier string no vacío como `host`. Falta un regex de hostname real (server-side en el schema + cliente en `DomainsCard.tsx`), cuidando no romper los dominios `.localhost` que ya se usan como fixtures de prueba.
- [ ] **Verificar que las env vars realmente lleguen al contenedor, con un caso que falle sin ellas.** Ya se corrigió el bug de que `envVars` nunca se pasaba a `docker.createContainer` (ahora sí, vía `Env: [...]`), y se agregó un chequeo de salud post-arranque (si el contenedor muere al toque, el deployment queda `failed` con el log real en vez de `running` mentiroso). **Falta desplegar de verdad los dos casos de prueba** (ej. `postgres:16-alpine` con `POSTGRES_PASSWORD` seteada → debe correr bien; la misma imagen sin esa variable → debe fallar con el error real de Postgres) y **escribir el test automatizado** que cubra ambos casos (archivo nuevo tipo `apps/api/src/__tests__/deploy.test.ts`, son tests de integración reales contra Docker, no mocks).
- [ ] **Consola para ejecutar comandos dentro de un contenedor (tipo Dokploy).** Pedido explícitamente por el usuario. Deliberadamente NO construido todavía — es un salto de superficie de ataque real (ejecución arbitraria vía dashboard, sin RBAC hoy). Queda la filosofía de seguridad escrita en `PLAN.md`. **Necesita confirmación explícita del usuario antes de tocar código acá.**
- [ ] **Soporte de color ANSI en los visores de log — falta re-verificar tras los últimos cambios.** Se instaló `ansi_up` y se conectó en `RuntimeLogs.tsx`/`DeploymentLogDialog.tsx`, pero no se llegó a confirmar visualmente con un contenedor que realmente emita colores (ej. `redis:alpine`, que imprime un banner ANSI a color al arrancar).

## Ya resuelto en esta misma tanda (para no repreguntar)

- 5 aplicaciones de prueba reales en el proyecto `test-my-apps`: `nginx` (imagen), `whoami` (imagen + dominio local), `todo-app` (Dockerfile real de `dockersamples/todo-list-app`), `with-env-vars`, `local-domain-test`.
- Exposición de apps por dominio + Traefik, cero puertos publicados al host — verificado real.
- Login real, CRUD completo de projects/applications/domains con datos reales (no mock).
- Logs de build (diálogo por deployment) + logs de runtime en vivo (WebSocket real contra `dockerode`).
