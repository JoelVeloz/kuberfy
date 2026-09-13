# Optimización del tamaño de imagen

Diagnóstico y fix real aplicados a la imagen de producción de Kuberfy. Metodología reproducible para futuras auditorías de peso.

## Herramientas usadas

- `docker history --no-trunc <imagen>` — peso por capa, sin instalar nada.
- [`dive`](https://github.com/wagoodman/dive) (`brew install dive`) — efficiency score, bytes duplicados entre capas, tamaño real sin comprimir por capa. Uso no interactivo: `CI=true dive <imagen> --json out.json`.
- `apk info -sq <paquete>` / `ldd <binario>` (dentro del contenedor) — para confirmar si una dependencia nativa (`libstdc++`, `libgcc`, `git`, ...) es realmente necesaria antes de intentar quitarla.

## Diagnóstico (antes)

Imagen: `ghcr.io/joelveloz/kuberfy:latest`, 3 binarios compilados vía `bun build --compile` (`server`, `migrate`, `create-user`) copiados sobre `alpine:3.20`.

| Capa                                           | Peso      |
| ---------------------------------------------- | --------- |
| `server`                                       | ~77 MB    |
| `create-user`                                  | ~76 MB    |
| `migrate`                                      | ~75 MB    |
| `apk add ca-certificates libstdc++ libgcc git` | ~15-16 MB |
| base alpine 3.20                               | ~8 MB     |
| assets (`public`, `drizzle`)                   | <1 MB     |

`dive` reportó **efficiency score 0.998** — casi no había bytes duplicados entre capas ni basura de build. El peso no era un descuido de capas, era **estructural**: los 3 binarios sumaban ~91% del tamaño total de la imagen.

**Causa raíz**: cada `bun build --compile` embebe el runtime completo de Bun (~70-75 MB) dentro del ejecutable resultante. `migrate.ts` y `create-user.ts` son wrappers de pocas líneas sobre módulos ya usados por el servidor, pero al compilarse por separado cada uno pagaba ese runtime de nuevo — el mismo Bun embebido 3 veces.

Se descartó quitar `libstdc++`/`libgcc`/`git` del `apk add`: `ldd` sobre el binario compilado confirmó que son dependencias dinámicas reales (el proceso no arranca sin ellas), y `git` lo usa `simple-git` en tiempo de ejecución para clonar los repos a deployar. Ese `apk add` ya es el mínimo viable sobre esta base.

## Fix aplicado

Un único entrypoint compilado (`apps/api/src/cli.ts`) que despacha por subcomando (`server` | `migrate` | `create-user` | `set-password`) reexportando la lógica ya existente en `src/index.ts`, `src/db/migrate.ts` y `scripts/*.ts` sin reescribirla. El Dockerfile pasa de compilar 3 binarios a compilar 1 (`kuberfy`), y el `CMD` pasa de `./migrate && ./server` a `./kuberfy migrate && ./kuberfy server`.

```dockerfile
# antes: 3 compilaciones, 3 runtimes de Bun embebidos
RUN bun build --compile --minify src/index.ts --outfile server
RUN bun build --compile --minify src/db/migrate.ts --outfile migrate
RUN bun build --compile --minify scripts/create-user.ts --outfile create-user

# después: 1 compilación, 1 runtime embebido
RUN bun build --compile --minify src/cli.ts --outfile kuberfy
```

## Resultado (medido, mismo host/arquitectura, antes vs. después)

|                                       | Antes    | Después  | Δ          |
| ------------------------------------- | -------- | -------- | ---------- |
| Tamaño sin comprimir (`dive`)         | 297.9 MB | 117.5 MB | **-60.6%** |
| Tamaño comprimido (pull del registry) | 120 MB   | 48.2 MB  | **-59.8%** |

Verificado funcionalmente tras el cambio: `./kuberfy migrate`, `./kuberfy create-user --email ... --role admin` y el arranque del servidor (`Bun.serve`) corren igual que antes; suite de tests de `apps/api` (29/29) sigue en verde.

## Techo adicional (evaluado, no aplicado)

- **UPX** sobre el binario único: comprimiría otros ~30-40% adicionales, pero agrega latencia de arranque por descompresión in-memory en cada `docker run`/restart. Para un servidor long-running no justifica el trade-off frente al ahorro ya conseguido — no se aplicó.
- **Distroless/scratch** en vez de `alpine`: no viable mientras el binario dependa dinámicamente de `libstdc++`/`libgcc` (confirmado con `ldd`) y se necesite `git` en runtime.

## Cómo re-auditar en el futuro

```bash
docker build -t kuberfy:check .
docker history --no-trunc kuberfy:check          # peso por capa, rápido
CI=true dive kuberfy:check --json /tmp/dive.json # efficiency score + detalle
```

Si el efficiency score baja de ~0.99 o alguna capa nueva pesa más que el resto combinado, repetir este mismo diagnóstico antes de agregar más dependencias nativas o binarios compilados por separado.
